import Anthropic from "@anthropic-ai/sdk";
import type { ToolDefinition } from "../types.js";
import { log } from "../trace.js";

const anthropic = new Anthropic();

const BROWSER_MODEL = process.env.BROWSER_USE_MODEL ?? "claude-sonnet-4-6";
const BROWSERBASE_HOST = process.env.BROWSERBASE_HOST ?? "https://api.browserbase.com";

function browserbaseKey(): string {
  const k = process.env.BROWSERBASE_API_KEY;
  if (!k) throw new Error("BROWSERBASE_API_KEY not set");
  return k;
}
function browserbaseProject(): string {
  const p = process.env.BROWSERBASE_PROJECT_ID;
  if (!p) throw new Error("BROWSERBASE_PROJECT_ID not set");
  return p;
}

interface Session {
  id: string;
  connectUrl?: string;
}

/**
 * Open a remote browser, navigate to a URL, capture a full-page screenshot,
 * and feed it to Claude vision with the user's plain-language goal. Returns
 * what Claude reads off the page.
 *
 * v0 — read-only. No clicking, typing, or multi-step navigation. Useful for
 *      "what does this status page say", "scrape today's price from this
 *      product page", "read the latest filing on this gov portal".
 *
 * For interactive flows (login, fill form, download), wire Anthropic Computer
 * Use or Stagehand. The interface here is forward-compatible.
 *
 * Shadow mode: we do still hit the real URL (it's a GET; no side effects).
 * Mark the result as shadow so the caller knows the agent is in dry-run.
 */
export function browserUseTool(): ToolDefinition {
  return {
    name: "browser_use",
    description:
      "Open a webpage in a remote browser and answer a question about what's on it. " +
      "Use when no API exists for a SaaS tool, government portal, or public web page. " +
      "Read-only — no clicks, no form fills. Provide a URL and a plain-language goal " +
      "describing what to extract or summarize.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL (must include https://)" },
        goal: {
          type: "string",
          description:
            "What to read or extract from the page, e.g. 'find today's USD/EUR rate' or " +
            "'summarize the latest USCIS announcement'.",
        },
      },
      required: ["url", "goal"],
    },
    invoke: async (input, ctx) => {
      const { url, goal } = input as { url: string; goal: string };
      let session: Session | null = null;

      try {
        session = await createSession();
        const screenshotBase64 = await screenshotViaBrowserbase(session.id, url);

        const res = await anthropic.messages.create({
          model: BROWSER_MODEL,
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: "image/png", data: screenshotBase64 },
                },
                {
                  type: "text",
                  text: `URL: ${url}\nGOAL: ${goal}\n\nAnswer the goal based on what's visible. If the page is paywalled, login-gated, or doesn't contain the requested info, say so explicitly.`,
                },
              ],
            },
          ],
        });

        const text = res.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { text: string }).text)
          .join("");

        return {
          content: ctx.shadow_mode ? `[shadow_mode] browser_use answer:\n${text}` : text,
          meta: { session_id: session.id, shadow: ctx.shadow_mode },
        };
      } catch (err) {
        return {
          content: `browser_use failed: ${(err as Error).message}`,
          is_error: true,
        };
      } finally {
        if (session) await closeSession(session.id).catch((err) => log.warn({ err }, "browser session close failed"));
      }
    },
  };
}

async function createSession(): Promise<Session> {
  const res = await fetch(`${BROWSERBASE_HOST}/v1/sessions`, {
    method: "POST",
    headers: {
      "X-BB-API-Key": browserbaseKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ projectId: browserbaseProject() }),
  });
  if (!res.ok) throw new Error(`browserbase create-session ${res.status} ${await res.text()}`);
  return (await res.json()) as Session;
}

async function screenshotViaBrowserbase(sessionId: string, url: string): Promise<string> {
  // Browserbase exposes a screenshot endpoint that drives the session for us.
  // For Stagehand-style navigation chains, switch to /v1/sessions/<id>/livenav
  // and a CDP client. v0 keeps it to one screenshot.
  const res = await fetch(`${BROWSERBASE_HOST}/v1/sessions/${sessionId}/screenshot`, {
    method: "POST",
    headers: {
      "X-BB-API-Key": browserbaseKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, fullPage: true }),
  });
  if (!res.ok) throw new Error(`browserbase screenshot ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
}

async function closeSession(sessionId: string): Promise<void> {
  await fetch(`${BROWSERBASE_HOST}/v1/sessions/${sessionId}`, {
    method: "DELETE",
    headers: { "X-BB-API-Key": browserbaseKey() },
  });
}
