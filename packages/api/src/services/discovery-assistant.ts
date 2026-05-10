import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  Tool,
  ToolUseBlock,
  ContentBlockParam,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { resolve } from "node:path";
import {
  query,
  listPackJobs,
  readPackJob,
  listTaskTemplates,
  log,
} from "runtime";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const client = new Anthropic();
const MODEL = process.env.DISCOVERY_MODEL ?? "claude-sonnet-4-6";
const MAX_TURNS = 10;
const PACKS_DIR = process.env.PACKS_DIR ?? resolve(process.cwd(), "packs");

const SYSTEM_PROMPT = `You are the Discovery Assistant. Your job is to interview a small-business owner or manager about their company and recommend which of our prebuilt templates would help them most.

Style rules:
- Warm, curious, concrete. No jargon ("workflow", "trigger", "guardrail", "tool"). Talk like an operator over coffee.
- ASK ONE QUESTION AT A TIME. Wait for the answer.
- Keep replies short — 2–4 sentences.
- Don't recommend until you understand their situation.

Discovery shape (cover these naturally over 4–7 turns):
1. **What does the company do?** Vertical, customers, size (people + customers).
2. **Who does what?** Founder doing X? Part-time bookkeeper? In-house ops? Outsourced support?
3. **What's the time-sink right now?** "Walk me through your week — what eats your time that feels mechanical?" Get concrete examples.
4. **What systems do you live in?** Email (Gmail/Outlook?), QuickBooks/Xero?, CRM?, Slack?, anything weird (legacy software, paper, scanned PDFs)?
5. **What scares you about automation?** What would you NEVER want done without your eyes on it?

When you have enough, call \`list_catalog\` to see what's available, then call \`recommend\` with 3–6 templates ranked by fit, each with a 1–2 sentence "why this one for you". Choose a mix of:
- A high-frequency atomic workflow (something that fires daily/weekly)
- A multi-phase task if they mentioned recurring multi-step work
- A trust-building "shadow mode" option for risk-averse users

Then in your final message, present the recommendations in plain language and tell them they can click any of them to install. Don't pretend they'll work magic — be honest about what they need to connect (Gmail, QuickBooks, etc.) and what stays under their control via approval gates.

Hard rules:
- Don't recommend templates whose required connectors the user said they don't have.
- If they're in a vertical we don't cover well (e.g. dental clinic — heavy compliance), say so honestly and recommend the generic horizontal ones.
- If they want something we don't have, tell them they can build a custom one via the "Tell me what you need" flow.`;

const TOOLS: Tool[] = [
  {
    name: "list_catalog",
    description: "Get the list of available workflow + task templates the user could install.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "recommend",
    description:
      "Save your ranked recommendations to the draft. The user sees these as install-able cards. Call once you've finished interviewing.",
    input_schema: {
      type: "object",
      required: ["picks"],
      properties: {
        picks: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            required: ["kind", "slug", "why"],
            properties: {
              kind: { type: "string", enum: ["workflow", "task"] },
              /** For workflow: pack/slug (e.g. 'bookkeeping/invoice-to-quickbooks'). For task: same shape. */
              slug: { type: "string" },
              why: { type: "string", description: "1–2 sentence reason tailored to this user" },
            },
          },
        },
        summary: {
          type: "string",
          description: "Optional 1-paragraph framing the user will see at the top of the recommendations list.",
        },
      },
    },
  },
];

interface DiscoveryDraftRow {
  id: string;
  workspace_id: string;
  user_id: string;
  messages: MessageParam[];
  recommendations: { picks: Array<{ kind: string; slug: string; why: string }>; summary?: string } | null;
  status: string;
}

export interface ChatTurnResult {
  assistant_message: string;
  recommendations_ready: boolean;
  draft: DiscoveryDraftRow;
}

// We reuse the spec_drafts table — the conversation shape is the same; the
// 'proposed_spec' jsonb column carries the recommendations payload instead
// of a workflow spec. Status moves through 'drafting' -> 'ready' -> 'installed'.

export async function startDiscovery(workspaceId: string, userId: string): Promise<DiscoveryDraftRow> {
  const r = await query<DiscoveryDraftRow>(
    `insert into spec_drafts (workspace_id, user_id, messages, proposed_spec)
       values ($1, $2, '[]'::jsonb, '{"kind":"discovery"}'::jsonb)
       returning id, workspace_id, user_id, messages, proposed_spec as recommendations, status`,
    [workspaceId, userId],
  );
  return r.rows[0]!;
}

export async function loadDiscovery(
  draftId: string,
  workspaceId: string,
): Promise<DiscoveryDraftRow | null> {
  const r = await query<DiscoveryDraftRow>(
    `select id, workspace_id, user_id, messages, proposed_spec as recommendations, status
       from spec_drafts where id = $1 and workspace_id = $2`,
    [draftId, workspaceId],
  );
  const row = r.rows[0];
  if (!row) return null;
  if ((row.recommendations as { kind?: string } | null)?.kind !== "discovery") return null;
  return row;
}

export async function sendDiscoveryMessage(
  draftId: string,
  workspaceId: string,
  userText: string,
): Promise<ChatTurnResult> {
  const draft = await loadDiscovery(draftId, workspaceId);
  if (!draft) throw new Error("discovery draft not found");

  const messages: MessageParam[] = [...draft.messages, { role: "user", content: userText }];
  let assistantText = "";
  let recommendationsReady = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response: Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });
    } catch (err) {
      log.error({ err }, "discovery-assistant Anthropic call failed");
      throw err;
    }

    messages.push({ role: "assistant", content: response.content });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    if (text) assistantText = text;

    const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason === "end_turn" || toolUses.length === 0) break;

    const results: ContentBlockParam[] = [];
    for (const tu of toolUses) {
      let res: string;
      let isError = false;
      try {
        if (tu.name === "list_catalog") {
          res = await summarizeCatalog();
        } else if (tu.name === "recommend") {
          await saveRecommendations(tu.input, draftId);
          recommendationsReady = true;
          res = "recommendations saved. The user can see them in the Recommendations panel.";
        } else {
          isError = true;
          res = `unknown tool: ${tu.name}`;
        }
      } catch (err) {
        isError = true;
        res = `tool error: ${(err as Error).message}`;
      }
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: res,
        is_error: isError,
      } as ToolResultBlockParam);
    }
    messages.push({ role: "user", content: results });
  }

  await query(
    `update spec_drafts set messages = $1, updated_at = now() where id = $2`,
    [JSON.stringify(messages), draftId],
  );

  const updated = (await loadDiscovery(draftId, workspaceId))!;
  return {
    assistant_message: assistantText,
    recommendations_ready: recommendationsReady,
    draft: updated,
  };
}

async function summarizeCatalog(): Promise<string> {
  const workflows = await listAllWorkflows();
  const tasks = await listTaskTemplates(PACKS_DIR);

  const lines: string[] = ["WORKFLOWS:"];
  for (const w of workflows) {
    lines.push(`  - ${w.pack}/${w.slug}: ${w.name}`);
    if (w.tagline) lines.push(`      ${w.tagline}`);
    if (w.what_youll_connect?.length) lines.push(`      needs: ${w.what_youll_connect.join(", ")}`);
  }
  lines.push("", "TASKS (multi-phase):");
  for (const t of tasks) {
    lines.push(`  - ${t.slug}: ${t.name}`);
    if (t.tagline) lines.push(`      ${t.tagline}`);
    lines.push(`      ${t.phases.length} phase(s)${t.phases.some((p) => p.human_gate) ? ", with human review" : ""}`);
  }
  return lines.join("\n");
}

async function listAllWorkflows(): Promise<
  Array<{
    pack: string;
    slug: string;
    name: string;
    tagline?: string;
    what_youll_connect?: string[];
  }>
> {
  const out: Array<{ pack: string; slug: string; name: string; tagline?: string; what_youll_connect?: string[] }> = [];
  let packs: string[];
  try {
    packs = await readdir(PACKS_DIR);
  } catch {
    return out;
  }
  for (const pack of packs) {
    const dir = join(PACKS_DIR, pack);
    try {
      const s = await stat(dir);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }
    try {
      const jobs = await listPackJobs(dir);
      for (const j of jobs) {
        out.push({
          pack,
          slug: j.slug,
          name: j.name,
          tagline: j.tagline,
          what_youll_connect: j.what_youll_connect,
        });
      }
    } catch {
      // pack with no workflows is fine
    }
  }
  return out;
}

async function saveRecommendations(input: unknown, draftId: string): Promise<void> {
  const payload = input as { picks: unknown; summary?: string };
  const body = { kind: "discovery", ...payload };
  await query(
    `update spec_drafts set proposed_spec = $1, status = 'ready', updated_at = now() where id = $2`,
    [JSON.stringify(body), draftId],
  );
}

export const GREETING =
  "Hey — let me get to know your business so I can suggest the right things to start with. What does your company do, and roughly how many people?";
