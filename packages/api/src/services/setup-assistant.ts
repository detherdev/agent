import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  Tool,
  ToolUseBlock,
  ContentBlockParam,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import {
  query,
  listConnectorSlugs,
  loadConnectorTools,
  Guardrails,
  ToolConfig,
  TriggerKind,
  log,
} from "runtime";

const client = new Anthropic();

const MODEL = process.env.SETUP_ASSISTANT_MODEL ?? "claude-sonnet-4-6";
const MAX_TURNS = 10;

const SYSTEM_PROMPT = `You are the Setup Assistant for an AI workflow platform. The person you're talking to is a non-technical owner or manager at a small business. Your job: translate what they describe into a workflow our agent runtime can execute.

Style rules:
- Warm and concrete. Use their words and their domain ("invoice", "client", "renewal"), not ours ("workflow", "trigger", "guardrail", "tool").
- Ask ONE question at a time. Wait for the answer before asking the next.
- Keep replies short — 2–4 sentences max unless summarizing the proposed spec.
- Never apologize or hedge unnecessarily.

Discovery — cover these in conversation (not as a checklist):
1. What's the recurring work — give me a concrete recent example
2. What starts it (an email arrives, a schedule, someone drops a file, someone clicks a button)
3. What systems/accounts you'd want me to touch
4. What could go wrong, and what you'd want me to ask you about first
5. Anything unusual to handle (edge cases, exceptions, holidays)

When you have enough information (usually 3–6 questions in), call \`propose_spec\` with a complete spec. Then say in plain English what you'll do and ask if it looks right.

If they ask for changes, call \`propose_spec\` again with the updated draft.

When they say "looks good" or similar, tell them: "Open the review tab — you can see exactly what I'll build, run it against some test cases without it actually doing anything yet, then flip it on."

Defaults to use unless they say otherwise:
- step_cap: 40, budget_usd: 0.75, redact_pii: true, shadow_mode: false
- Always add an approval rule for any tool that sends money or external communication: gmail_send, outlook_send, slack_post_message, quickbooks_create_bill, stripe_create_invoice_item.
- Generate 4–6 test cases that cover: the happy path, the approval-gate case, an edge case ("missing data"), and a "don't do anything" case.

Available built-in tools you can include in tool_config.builtins:
- document_understand: extract structured data from a PDF or image (e.g. invoice attachment).
- browser_use: read a webpage when no API exists.

Before proposing tools, call \`list_connectors\` to see what's available. Don't invent connector slugs that aren't in the list.`;

const TOOLS: Tool[] = [
  {
    name: "list_connectors",
    description: "Get the list of OAuth-backed connector slugs available for tool_config.connectors.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_builtins",
    description: "Get the list of built-in tools available for tool_config.builtins (e.g. document_understand, browser_use).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "propose_spec",
    description:
      "Save the current proposed WorkflowInstallSpec for this draft. Call this whenever you've built or revised the spec based on the user's input. After this returns, the spec is visible to the user in the Review tab.",
    input_schema: {
      type: "object",
      required: [
        "name",
        "goal",
        "trigger_kind",
        "trigger_config",
        "tool_config",
        "guardrails",
        "model",
        "test_cases",
      ],
      properties: {
        name: { type: "string", description: "Short human-readable name, e.g. 'Chase overdue invoices'" },
        goal: {
          type: "string",
          description:
            "Plain-language system prompt the agent will run with. Multi-paragraph. Should fully describe what the agent does, how it decides, what tone to use, and any hard rules.",
        },
        trigger_kind: {
          type: "string",
          enum: ["manual", "webhook", "schedule", "email", "inbound_email", "drive_watch"],
        },
        trigger_config: {
          type: "object",
          description:
            "Trigger-specific config. For schedule: {cron: '0 9 * * 1-5', timezone: 'America/Los_Angeles'}. For email: {label: 'to-bookkeeping'}. For drive_watch: {folder_id: '...'}. For inbound_email/manual/webhook: empty.",
        },
        tool_config: {
          type: "object",
          properties: {
            connectors: {
              type: "array",
              items: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
            },
            builtins: { type: "array", items: { type: "string", enum: ["document_understand", "browser_use"] } },
            mcp_servers: {
              type: "array",
              items: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
            },
            custom_tools: { type: "array", items: { type: "object" } },
          },
        },
        guardrails: {
          type: "object",
          properties: {
            step_cap: { type: "integer", minimum: 1 },
            budget_usd: { type: "number", minimum: 0 },
            redact_pii: { type: "boolean" },
            shadow_mode: { type: "boolean" },
            approvals: {
              type: "array",
              items: {
                type: "object",
                required: ["tool", "reason"],
                properties: {
                  tool: { type: "string" },
                  when: { type: "string", description: "Plain-language condition, e.g. 'amount > 5000'" },
                  reason: { type: "string" },
                },
              },
            },
          },
        },
        model: { type: "string", description: "Usually 'claude-sonnet-4-6'" },
        planner_model: { type: ["string", "null"], description: "Usually null" },
        test_cases: {
          type: "array",
          items: {
            type: "object",
            required: ["name", "input", "rubric"],
            properties: {
              name: { type: "string" },
              input: { type: "object" },
              rubric: { type: "string", description: "Natural-language pass criteria for Claude-as-judge" },
            },
          },
        },
      },
    },
  },
];

interface DraftRow {
  id: string;
  workspace_id: string;
  user_id: string;
  messages: MessageParam[];
  proposed_spec: unknown;
  status: string;
  installed_workflow_id: string | null;
}

export interface ChatTurnResult {
  assistant_message: string;
  proposed_spec_updated: boolean;
  draft: DraftRow;
}

export async function startDraft(workspaceId: string, userId: string): Promise<DraftRow> {
  const r = await query<DraftRow>(
    `insert into spec_drafts (workspace_id, user_id, messages) values ($1, $2, '[]'::jsonb)
       returning id, workspace_id, user_id, messages, proposed_spec, status, installed_workflow_id`,
    [workspaceId, userId],
  );
  return r.rows[0]!;
}

export async function loadDraft(draftId: string, workspaceId: string): Promise<DraftRow | null> {
  const r = await query<DraftRow>(
    `select id, workspace_id, user_id, messages, proposed_spec, status, installed_workflow_id
       from spec_drafts where id = $1 and workspace_id = $2`,
    [draftId, workspaceId],
  );
  return r.rows[0] ?? null;
}

export async function sendUserMessage(
  draftId: string,
  workspaceId: string,
  userText: string,
): Promise<ChatTurnResult> {
  const draft = await loadDraft(draftId, workspaceId);
  if (!draft) throw new Error("draft not found");
  if (draft.status === "installed" || draft.status === "archived") {
    throw new Error(`draft is ${draft.status}; cannot continue`);
  }

  const messages: MessageParam[] = [...draft.messages, { role: "user", content: userText }];
  let proposedSpecUpdated = false;
  let assistantText = "";

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
      log.error({ err }, "setup-assistant Anthropic call failed");
      throw err;
    }

    messages.push({ role: "assistant", content: response.content });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    if (text) assistantText = text;

    const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

    if (response.stop_reason === "end_turn" || toolUses.length === 0) {
      break;
    }

    const results: ContentBlockParam[] = [];
    for (const tu of toolUses) {
      let res: string;
      let isError = false;
      try {
        const out = await invokeSetupTool(tu.name, tu.input, draftId);
        if (out.proposedSpecUpdated) proposedSpecUpdated = true;
        res = out.content;
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

  // Persist updated conversation + status.
  await query(
    `update spec_drafts
        set messages = $1,
            status = case when proposed_spec is not null then 'ready' else status end,
            updated_at = now()
      where id = $2`,
    [JSON.stringify(messages), draftId],
  );

  const updated = (await loadDraft(draftId, workspaceId))!;
  return { assistant_message: assistantText, proposed_spec_updated: proposedSpecUpdated, draft: updated };
}

interface ToolOutcome {
  content: string;
  proposedSpecUpdated: boolean;
}

async function invokeSetupTool(name: string, input: unknown, draftId: string): Promise<ToolOutcome> {
  switch (name) {
    case "list_connectors":
      return { content: listConnectorsSummary(), proposedSpecUpdated: false };
    case "list_builtins":
      return { content: listBuiltinsSummary(), proposedSpecUpdated: false };
    case "propose_spec":
      return await proposeSpec(input, draftId);
    default:
      throw new Error(`unknown setup tool: ${name}`);
  }
}

function listConnectorsSummary(): string {
  const slugs = listConnectorSlugs();
  const lines = slugs.map((slug) => {
    const tools = loadConnectorTools(slug);
    const toolNames = tools.map((t) => t.name).join(", ");
    return `- ${slug}: ${toolNames}`;
  });
  return `Available connectors:\n${lines.join("\n")}`;
}

function listBuiltinsSummary(): string {
  return [
    "Available built-ins:",
    "- document_understand: extract structured data from a PDF or image attachment (use for invoices, receipts, scanned forms, screenshots)",
    "- browser_use: open a webpage and answer a question about it (use only when no API/connector exists for the data source — slow + read-only)",
  ].join("\n");
}

async function proposeSpec(input: unknown, draftId: string): Promise<ToolOutcome> {
  const raw = input as Record<string, unknown>;
  try {
    ToolConfig.parse(raw.tool_config ?? {});
    Guardrails.parse(raw.guardrails ?? {});
    TriggerKind.parse(raw.trigger_kind);
  } catch (err) {
    return {
      content: `validation failed: ${(err as Error).message}. Fix the spec and call propose_spec again.`,
      proposedSpecUpdated: false,
    };
  }

  await query(
    `update spec_drafts set proposed_spec = $1, status = 'ready', updated_at = now() where id = $2`,
    [JSON.stringify(raw), draftId],
  );

  return {
    content: "spec saved. The user can see it in the Review tab.",
    proposedSpecUpdated: true,
  };
}

/** Greeting message used to seed the first turn. Returned as text so the UI can render it immediately. */
export const GREETING =
  "Hey — what would you like me to handle for you? Give me a concrete recent example if you can: who does this work today, and what triggers it.";
