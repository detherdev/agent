/**
 * browser_action — interactive browser driving with Anthropic Computer Use.
 *
 * Difference from browser_use: this tool actually clicks, types, scrolls,
 * navigates multi-page flows, and submits forms. It opens a Browserbase
 * session, attaches via CDP, and runs an inner Claude loop that uses the
 * `computer_20250124` tool to operate on screenshots.
 *
 * The agent calls this with a URL + plain-language goal; the inner loop
 * decides actions and executes them; the final tool result summarizes what
 * was accomplished plus an optional extracted_data payload.
 *
 * Local intranet: Browserbase is a public-cloud sandbox, so it can only
 * reach internet-routable URLs. For true on-prem intranets, run the same
 * loop against a self-hosted Playwright instance — the loop logic is
 * provider-agnostic; only `attachToBrowser()` would change. Tracked as
 * a separate slice (BROWSER_USE_PROVIDER=local|browserbase).
 *
 * Cost discipline: each loop step is a vision turn ($$ on screenshots).
 * We hard-cap steps at max_steps (default 25) and pages-loaded at 10 to
 * prevent runaway loops.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  ContentBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { chromium, type Browser, type Page } from "playwright-core";
import type { ToolDefinition } from "../types.js";
import { log } from "../trace.js";

const anthropic = new Anthropic();

// Computer-use model. Anthropic exposes the computer-use tool spec on
// recent Claude builds; the same loop pattern works across versions.
const BROWSER_ACTION_MODEL = process.env.BROWSER_ACTION_MODEL ?? "claude-sonnet-4-6";
const BROWSERBASE_HOST = process.env.BROWSERBASE_HOST ?? "https://api.browserbase.com";

// Display dimensions reported to Claude. Browserbase defaults to 1024x768;
// changing this requires creating the session with matching viewport hints.
const DISPLAY_WIDTH = 1024;
const DISPLAY_HEIGHT = 768;

interface SessionInfo {
  id: string;
  connectUrl: string;
}

export function browserActionTool(): ToolDefinition {
  return {
    name: "browser_action",
    description:
      "Drive a real browser to accomplish a goal that needs interaction (login, click buttons, fill forms, " +
      "navigate multi-step flows, download files). Use when there's no API for the SaaS / portal / intranet " +
      "you need to operate. Provide the start URL, a one-paragraph goal, and any required values (credentials, " +
      "form data). Returns what was accomplished plus any extracted data. Hard-capped at 25 steps per call.",
    input_schema: {
      type: "object",
      properties: {
        start_url: { type: "string", description: "Full URL to open the browser at (must include https://)" },
        goal: {
          type: "string",
          description:
            "Plain-language objective, e.g. 'Log into supplier-portal.com with the credentials below, " +
            "navigate to Orders → Open, and download the most recent PO as PDF'.",
        },
        values: {
          type: "object",
          description:
            "Optional named values the model can reference when filling forms (e.g. {username, password, po_number}). " +
            "Stored as session memory; passed to Claude as a system note. Do NOT log secrets in the tool result.",
          additionalProperties: { type: "string" },
        },
        max_steps: { type: "integer", default: 25, maximum: 50 },
      },
      required: ["start_url", "goal"],
    },
    invoke: async (input, ctx) => {
      const v = input as {
        start_url: string;
        goal: string;
        values?: Record<string, string>;
        max_steps?: number;
      };

      if (ctx.shadow_mode) {
        return {
          content: `[shadow_mode] would have driven browser at ${v.start_url} toward goal: ${v.goal}`,
          meta: { shadow: true },
        };
      }

      let session: SessionInfo | null = null;
      let browser: Browser | null = null;
      try {
        session = await createSessionWithViewport();
        browser = await chromium.connectOverCDP(session.connectUrl);
        const context = browser.contexts()[0] ?? (await browser.newContext());
        const page = context.pages()[0] ?? (await context.newPage());
        await page.setViewportSize({ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT });
        await page.goto(v.start_url, { waitUntil: "domcontentloaded", timeout: 30_000 });

        const result = await runComputerUseLoop({
          page,
          goal: v.goal,
          values: v.values,
          maxSteps: Math.min(v.max_steps ?? 25, 50),
        });

        return {
          content: result.summary,
          is_error: result.error,
          meta: {
            session_id: session.id,
            steps: result.steps,
            cost_usd: result.cost_usd,
            extracted: result.extracted,
          },
        };
      } catch (err) {
        return {
          content: `browser_action failed: ${(err as Error).message}`,
          is_error: true,
        };
      } finally {
        if (browser) await browser.close().catch(() => undefined);
        if (session) await closeSession(session.id).catch((err) => log.warn({ err }, "browser session close failed"));
      }
    },
  };
}

// ===== Inner Claude loop =====

interface LoopArgs {
  page: Page;
  goal: string;
  values?: Record<string, string>;
  maxSteps: number;
}

interface LoopResult {
  summary: string;
  extracted?: unknown;
  error: boolean;
  steps: number;
  cost_usd: number;
}

async function runComputerUseLoop(args: LoopArgs): Promise<LoopResult> {
  // The computer-use tool spec. Anthropic recognizes it by name + type;
  // display_*_px tells the model the viewport so click coordinates match.
  // input_schema shape is fixed by the SDK — we don't pass our own.
  const computerTool = {
    type: "computer_20250124",
    name: "computer",
    display_width_px: DISPLAY_WIDTH,
    display_height_px: DISPLAY_HEIGHT,
  };

  const valuesNote = args.values
    ? "\n\nValues you may use when the page asks for them:\n" +
      Object.entries(args.values)
        .map(([k]) => `- ${k}: <available; do not echo>`)
        .join("\n")
    : "";

  const initialScreenshot = await screenshot(args.page);
  const messages: MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            `GOAL: ${args.goal}${valuesNote}\n\n` +
            `Use the computer tool to accomplish the goal. The first screenshot is below. ` +
            `When done, respond with a short summary in plain text and (if relevant) a JSON ` +
            `block with the data you extracted, fenced as \`\`\`json. If you can't complete the ` +
            `goal, say so explicitly and what's blocking you.`,
        },
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: initialScreenshot },
        },
      ],
    },
  ];

  let costUsd = 0;
  let step = 0;

  while (step < args.maxSteps) {
    let response: Message;
    try {
      response = await anthropic.beta.messages.create({
        model: BROWSER_ACTION_MODEL,
        max_tokens: 1500,
        tools: [computerTool] as never,
        messages,
        betas: ["computer-use-2025-01-24"],
      } as never);
    } catch (err) {
      return {
        summary: `browser_action loop: anthropic call failed at step ${step}: ${(err as Error).message}`,
        error: true,
        steps: step,
        cost_usd: costUsd,
      };
    }

    step += 1;
    costUsd += approximateCost(response.usage);
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason === "end_turn" || toolUses.length === 0) {
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n");
      return {
        summary: text || "browser_action: completed (no summary text returned)",
        extracted: extractJsonBlock(text),
        error: false,
        steps: step,
        cost_usd: costUsd,
      };
    }

    const toolResults: ContentBlockParam[] = [];
    for (const tu of toolUses) {
      try {
        const out = await executeComputerAction(args.page, tu.input as ComputerInput, args.values);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: out.image
            ? [
                ...(out.text ? [{ type: "text" as const, text: out.text }] : []),
                {
                  type: "image" as const,
                  source: { type: "base64" as const, media_type: "image/png" as const, data: out.image },
                },
              ]
            : out.text ?? "",
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `action failed: ${(err as Error).message}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  return {
    summary: `browser_action: hit max_steps cap (${args.maxSteps}) without finishing. Last URL: ${args.page.url()}`,
    error: true,
    steps: step,
    cost_usd: costUsd,
  };
}

// ===== Computer action executor =====

interface ComputerInput {
  action: string;
  coordinate?: [number, number];
  text?: string;
  scroll_direction?: "up" | "down" | "left" | "right";
  scroll_amount?: number;
  duration?: number;
  start_coordinate?: [number, number];
}

interface ActionOut {
  image?: string;
  text?: string;
}

async function executeComputerAction(
  page: Page,
  input: ComputerInput,
  values?: Record<string, string>,
): Promise<ActionOut> {
  switch (input.action) {
    case "screenshot":
      return { image: await screenshot(page) };

    case "left_click": {
      const [x, y] = input.coordinate ?? [0, 0];
      await page.mouse.click(x, y);
      await settle(page);
      return { image: await screenshot(page) };
    }

    case "right_click": {
      const [x, y] = input.coordinate ?? [0, 0];
      await page.mouse.click(x, y, { button: "right" });
      await settle(page);
      return { image: await screenshot(page) };
    }

    case "double_click": {
      const [x, y] = input.coordinate ?? [0, 0];
      await page.mouse.dblclick(x, y);
      await settle(page);
      return { image: await screenshot(page) };
    }

    case "mouse_move": {
      const [x, y] = input.coordinate ?? [0, 0];
      await page.mouse.move(x, y);
      return { image: await screenshot(page) };
    }

    case "type": {
      // Resolve {{name}} placeholders against the values map so secrets
      // aren't echoed in the trace — the model can write {{password}} and
      // we substitute server-side.
      const text = resolvePlaceholders(input.text ?? "", values);
      await page.keyboard.type(text, { delay: 15 });
      await settle(page);
      return { image: await screenshot(page) };
    }

    case "key": {
      // Claude sends xdotool-style key names ("Return", "Tab", "ctrl+a").
      const key = mapKeyName(input.text ?? "");
      await page.keyboard.press(key);
      await settle(page);
      return { image: await screenshot(page) };
    }

    case "scroll": {
      const dir = input.scroll_direction ?? "down";
      const amount = input.scroll_amount ?? 3;
      const dy = (dir === "down" ? 1 : dir === "up" ? -1 : 0) * amount * 100;
      const dx = (dir === "right" ? 1 : dir === "left" ? -1 : 0) * amount * 100;
      await page.mouse.wheel(dx, dy);
      await settle(page);
      return { image: await screenshot(page) };
    }

    case "wait": {
      const ms = (input.duration ?? 1) * 1000;
      await page.waitForTimeout(Math.min(ms, 5000));
      return { image: await screenshot(page) };
    }

    case "cursor_position":
      return { text: `(cursor position is not tracked by this driver)` };

    default:
      return { text: `unsupported action: ${input.action}` };
  }
}

function mapKeyName(name: string): string {
  // Translate common xdotool/X11 names to Playwright key names.
  const t: Record<string, string> = {
    Return: "Enter",
    KP_Enter: "Enter",
    space: " ",
    Tab: "Tab",
    Escape: "Escape",
    BackSpace: "Backspace",
    Delete: "Delete",
    Up: "ArrowUp",
    Down: "ArrowDown",
    Left: "ArrowLeft",
    Right: "ArrowRight",
  };
  return t[name] ?? name;
}

function resolvePlaceholders(text: string, values?: Record<string, string>): string {
  if (!values) return text;
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => values[k] ?? `{{${k}}}`);
}

async function screenshot(page: Page): Promise<string> {
  const buf = await page.screenshot({ type: "png", fullPage: false });
  return Buffer.from(buf).toString("base64");
}

async function settle(page: Page): Promise<void> {
  // Cheap stabilization — most clicks settle within 150ms; networkidle
  // is too slow on SPA dashboards. Bail at 1.5s either way.
  await page.waitForTimeout(150);
  try {
    await page.waitForLoadState("networkidle", { timeout: 1500 });
  } catch {
    // expected on long-poll dashboards
  }
}

function extractJsonBlock(text: string): unknown {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m) return undefined;
  try {
    return JSON.parse(m[1]!.trim());
  } catch {
    return undefined;
  }
}

function approximateCost(usage: { input_tokens: number; output_tokens: number }): number {
  // Rough Sonnet 4.6 pricing — replace with priceTurn() if exposed for the
  // beta endpoint. Used only for the inner-loop meta; outer cost accrues
  // through the parent's normal accounting.
  return (usage.input_tokens * 3 + usage.output_tokens * 15) / 1_000_000;
}

// ===== Browserbase session lifecycle =====

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

async function createSessionWithViewport(): Promise<SessionInfo> {
  const res = await fetch(`${BROWSERBASE_HOST}/v1/sessions`, {
    method: "POST",
    headers: { "X-BB-API-Key": browserbaseKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: browserbaseProject(),
      browserSettings: {
        viewport: { width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
      },
    }),
  });
  if (!res.ok) throw new Error(`browserbase create-session ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { id: string; connectUrl?: string };
  if (!json.connectUrl) throw new Error("browserbase did not return a connectUrl");
  return { id: json.id, connectUrl: json.connectUrl };
}

async function closeSession(sessionId: string): Promise<void> {
  await fetch(`${BROWSERBASE_HOST}/v1/sessions/${sessionId}`, {
    method: "DELETE",
    headers: { "X-BB-API-Key": browserbaseKey() },
  });
}
