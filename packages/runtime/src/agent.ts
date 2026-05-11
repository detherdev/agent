import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  TextBlock,
  TextBlockParam,
  ToolUseBlock,
  ContentBlockParam,
  ToolResultBlockParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";

import type { Workflow, ToolDefinition, ToolResult, TurnRecord } from "./types.js";
import { buildToolset } from "./tools/index.js";
import { checkPreToolCall, checkPreTurn, redactPII } from "./guardrails.js";
import {
  appendTurn,
  createApproval,
  loadPendingApproval,
  loadTurns,
  updateRunStatus,
} from "./state.js";
import { priceTurn } from "./pricing.js";
import { runLog } from "./trace.js";

const client = new Anthropic();

export interface RunAgentArgs {
  workflow: Workflow;
  runId: string;
  input: unknown;
  shadowMode?: boolean;
}

export interface RunAgentResult {
  status: "succeeded" | "failed" | "awaiting_approval" | "budget_exceeded";
  result?: unknown;
  error?: string;
  cost_usd: number;
  step_count: number;
}

export async function runAgent(args: RunAgentArgs): Promise<RunAgentResult> {
  const { workflow, runId, input, shadowMode } = args;
  await updateRunStatus(runId, { status: "running", started_at: new Date() });

  const tools = await buildToolset(workflow.tool_config, workflow.workspace_id, workflow);
  const messages: MessageParam[] = [
    { role: "user", content: typeof input === "string" ? input : JSON.stringify(input) },
  ];

  return continueLoop({
    workflow,
    runId,
    messages,
    tools,
    step: 0,
    costUsd: 0,
    shadowMode: shadowMode ?? workflow.guardrails.shadow_mode,
  });
}

/**
 * Resume an awaiting_approval run after the user approves (or edits) the
 * gated tool call. Loads the approval, applies the approved/edited input as
 * an override on the matching tool_use_id, and re-enters the loop.
 */
export async function resumeAfterApproval(
  runId: string,
  workflow: Workflow,
): Promise<RunAgentResult> {
  const approval = await loadPendingApproval(runId);
  if (!approval) throw new Error(`no approval found for run ${runId}`);
  if (approval.status === "rejected" || approval.status === "expired") {
    throw new Error(`approval ${approval.id} is ${approval.status}; cannot resume`);
  }
  if (approval.status !== "approved" && approval.status !== "edited") {
    throw new Error(`approval ${approval.id} is still ${approval.status}; not ready to resume`);
  }

  const turns = await loadTurns(runId);
  const lastAssistant = lastAssistantTurn(turns);
  const matchingToolUse = lastAssistant?.toolUses.find(
    (tu) =>
      tu.name === approval.pending_tool_name &&
      deepEqual(tu.input, approval.pending_tool_input),
  );

  const overrides = new Map<string, unknown>();
  if (matchingToolUse) {
    const approvedInput =
      approval.status === "edited" ? approval.edited_input : approval.pending_tool_input;
    overrides.set(matchingToolUse.id, approvedInput);
  }

  return resumeFromTurns(workflow, runId, overrides, "approval");
}

/**
 * Resume a run that was crash-stranded mid-loop (the worker died after
 * persisting some turns but before the run reached a terminal state).
 * Re-executes any tool_uses from the last assistant turn that don't have
 * a matching tool turn, then continues the loop.
 *
 * Idempotency: tool turns already persisted are reused; only the missing
 * ones get re-invoked. Side-effecting tools that already ran (and were
 * persisted) won't run twice.
 */
export async function resumeAfterCrash(
  runId: string,
  workflow: Workflow,
): Promise<RunAgentResult> {
  return resumeFromTurns(workflow, runId, new Map(), "crash");
}

/**
 * Shared resume core for both the approval and crash paths. Re-executes
 * any pending tool_uses (those declared by the last assistant turn but
 * without a matching tool turn yet), pushes a single user-message
 * containing all tool_results (already-executed + freshly-executed), and
 * re-enters the agent loop.
 */
async function resumeFromTurns(
  workflow: Workflow,
  runId: string,
  overrides: Map<string, unknown>,
  reason: "approval" | "crash",
): Promise<RunAgentResult> {
  const log = runLog(runId);
  await updateRunStatus(runId, { status: "running", started_at: new Date() });

  const tools = await buildToolset(workflow.tool_config, workflow.workspace_id, workflow);
  const toolByName = new Map(tools.map((t) => [t.name, t]));

  const turns = await loadTurns(runId);
  const initialInput = await loadRunInput(runId);

  const { messages, pendingToolUses, executedToolResults, step, costUsd } = rebuildMessages(
    turns,
    initialInput,
  );

  const ctx = {
    run_id: runId,
    workflow_id: workflow.id,
    workspace_id: workflow.workspace_id,
    shadow_mode: workflow.guardrails.shadow_mode,
  };

  // Execute any tool_uses that didn't run before the pause / crash.
  const newToolResults: ContentBlockParam[] = [];
  for (const tu of pendingToolUses) {
    const useInput = overrides.has(tu.id) ? overrides.get(tu.id) : tu.input;

    const tool = toolByName.get(tu.name);
    if (!tool) {
      newToolResults.push(toolResultBlock(tu.id, `Unknown tool: ${tu.name}`, true));
      continue;
    }

    let res: ToolResult;
    try {
      res = await tool.invoke(useInput, { ...ctx, step });
    } catch (err) {
      res = { content: `Tool error: ${(err as Error).message}`, is_error: true };
    }

    const content = workflow.guardrails.redact_pii ? redactPII(res.content) : res.content;
    newToolResults.push(toolResultBlock(tu.id, content, res.is_error));

    await appendTurn(runId, {
      step,
      role: "tool",
      content: { tool_use_id: tu.id, content },
      tool_name: tu.name,
      tool_input: useInput,
      tool_result: res,
    });
  }

  // Combine executed + freshly-executed tool_results into one user message
  // — Anthropic's API requires a tool_result for every tool_use in the
  // preceding assistant message.
  const combined = [...executedToolResults, ...newToolResults];
  if (combined.length > 0) {
    messages.push({ role: "user", content: combined });
  }

  log.info(
    {
      reason,
      step,
      pending: pendingToolUses.length,
      already_executed: executedToolResults.length,
    },
    "resumed run",
  );

  return continueLoop({
    workflow,
    runId,
    messages,
    tools,
    step,
    costUsd,
    shadowMode: workflow.guardrails.shadow_mode,
  });
}

function lastAssistantTurn(turns: TurnRecord[]): { step: number; toolUses: ToolUseBlock[] } | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t && t.role === "assistant") {
      const content = t.content as Array<TextBlock | ToolUseBlock>;
      const toolUses = content.filter((b): b is ToolUseBlock => b.type === "tool_use");
      return { step: t.step, toolUses };
    }
  }
  return null;
}

interface ContinueArgs {
  workflow: Workflow;
  runId: string;
  messages: MessageParam[];
  tools: ToolDefinition[];
  step: number;
  costUsd: number;
  shadowMode: boolean;
}

async function continueLoop(args: ContinueArgs): Promise<RunAgentResult> {
  const { workflow, runId, messages, tools, shadowMode } = args;
  let { step, costUsd } = args;
  const log = runLog(runId);

  const toolByName = new Map(tools.map((t) => [t.name, t]));
  const anthropicTools: Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Tool["input_schema"],
  }));
  const ctx = {
    run_id: runId,
    workflow_id: workflow.id,
    workspace_id: workflow.workspace_id,
    shadow_mode: shadowMode,
  };

  while (true) {
    const pre = checkPreTurn({ guardrails: workflow.guardrails, step, cost_usd: costUsd });
    if (pre.kind === "step_cap_exceeded") {
      await finish(runId, "failed", { error: "step cap exceeded", cost: costUsd, steps: step });
      return { status: "failed", error: "step cap exceeded", cost_usd: costUsd, step_count: step };
    }
    if (pre.kind === "budget_exceeded") {
      await finish(runId, "budget_exceeded", { cost: costUsd, steps: step });
      return { status: "budget_exceeded", cost_usd: costUsd, step_count: step };
    }

    const t0 = Date.now();
    let response: Message;
    try {
      response = await client.messages.create({
        model: workflow.model,
        max_tokens: 4096,
        system: cacheable(workflow.goal),
        tools: anthropicTools.length ? cacheableTools(anthropicTools) : undefined,
        messages,
      });
    } catch (err) {
      log.error({ err }, "anthropic call failed");
      await finish(runId, "failed", { error: (err as Error).message, cost: costUsd, steps: step });
      return { status: "failed", error: (err as Error).message, cost_usd: costUsd, step_count: step };
    }

    step += 1;
    const turnCost = priceTurn(workflow.model, response.usage);
    costUsd += turnCost;

    await appendTurn(runId, {
      step,
      role: "assistant",
      content: response.content,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: response.usage.cache_creation_input_tokens ?? 0,
      cost_usd: turnCost,
      duration_ms: Date.now() - t0,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

    if (response.stop_reason === "end_turn" || toolUses.length === 0) {
      const finalText = response.content
        .filter((b): b is TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      await finish(runId, "succeeded", { result: finalText, cost: costUsd, steps: step });
      return { status: "succeeded", result: finalText, cost_usd: costUsd, step_count: step };
    }

    const toolResults: ContentBlockParam[] = [];

    for (const tu of toolUses) {
      const decision = checkPreToolCall({
        guardrails: workflow.guardrails,
        step,
        cost_usd: costUsd,
        tool_name: tu.name,
      });

      if (decision.kind === "needs_approval") {
        await createApproval({
          runId,
          workspaceId: workflow.workspace_id,
          step,
          reason: decision.rule.reason,
          toolName: tu.name,
          toolInput: tu.input,
        });
        log.info({ tool: tu.name, reason: decision.rule.reason }, "paused for approval");
        await updateRunStatus(runId, { cost_usd: costUsd, step_count: step });
        return { status: "awaiting_approval", cost_usd: costUsd, step_count: step };
      }

      const tool = toolByName.get(tu.name);
      if (!tool) {
        toolResults.push(toolResultBlock(tu.id, `Unknown tool: ${tu.name}`, true));
        continue;
      }

      let res: ToolResult;
      try {
        res = await tool.invoke(tu.input, { ...ctx, step });
      } catch (err) {
        res = { content: `Tool error: ${(err as Error).message}`, is_error: true };
      }

      const content = workflow.guardrails.redact_pii ? redactPII(res.content) : res.content;
      toolResults.push(toolResultBlock(tu.id, content, res.is_error));

      await appendTurn(runId, {
        step,
        role: "tool",
        content: { tool_use_id: tu.id, content },
        tool_name: tu.name,
        tool_input: tu.input,
        tool_result: res,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }
}

interface RebuiltState {
  messages: MessageParam[];
  /** tool_uses from the last assistant turn that don't yet have a tool turn */
  pendingToolUses: ToolUseBlock[];
  /** tool_results for the last assistant turn that ARE already persisted */
  executedToolResults: ToolResultBlockParam[];
  step: number;
  costUsd: number;
}

/**
 * Reconstruct the Anthropic-shaped message array from persisted turns,
 * splitting out the last step's tool_uses into "already executed" vs
 * "pending" so the caller can finish a partial step before re-entering
 * the loop.
 *
 * Earlier (fully-completed) steps are pushed inline. The last step's
 * tool_results are deliberately *not* pushed — the caller assembles them
 * from `executedToolResults` plus any fresh executions, then pushes a
 * single combined user message (Anthropic's API requires all tool_uses
 * to have matching tool_results in the same message).
 */
function rebuildMessages(turns: TurnRecord[], initialInput: unknown): RebuiltState {
  const messages: MessageParam[] = [
    { role: "user", content: typeof initialInput === "string" ? initialInput : JSON.stringify(initialInput) },
  ];

  const stepMap = new Map<number, { assistant?: TurnRecord; tools: TurnRecord[] }>();
  for (const t of turns) {
    if (!stepMap.has(t.step)) stepMap.set(t.step, { tools: [] });
    const bucket = stepMap.get(t.step)!;
    if (t.role === "assistant") bucket.assistant = t;
    else if (t.role === "tool") bucket.tools.push(t);
  }

  const sortedSteps = [...stepMap.keys()].sort((a, b) => a - b);
  let costUsd = 0;
  let lastAssistantToolUses: ToolUseBlock[] = [];
  let lastStepToolTurns: TurnRecord[] = [];

  for (let i = 0; i < sortedSteps.length; i++) {
    const stepNum = sortedSteps[i]!;
    const bucket = stepMap.get(stepNum)!;
    const isLast = i === sortedSteps.length - 1;

    if (bucket.assistant) {
      const content = bucket.assistant.content as Array<TextBlock | ToolUseBlock>;
      messages.push({ role: "assistant", content: content as never });
      costUsd += Number(bucket.assistant.cost_usd ?? 0);
      if (isLast) {
        lastAssistantToolUses = content.filter((b): b is ToolUseBlock => b.type === "tool_use");
      }
    }

    if (bucket.tools.length > 0) {
      if (isLast) {
        // Hold these aside; caller will combine with any freshly-executed
        // tool_results into one user message.
        lastStepToolTurns = bucket.tools;
      } else {
        const toolResults: ToolResultBlockParam[] = bucket.tools.map((t) => toolTurnAsResult(t));
        messages.push({ role: "user", content: toolResults });
      }
    }
  }

  const executedIds = new Set(
    lastStepToolTurns.map((t) => (t.content as { tool_use_id: string }).tool_use_id),
  );
  const pendingToolUses = lastAssistantToolUses.filter((tu) => !executedIds.has(tu.id));
  const executedToolResults = lastStepToolTurns.map(toolTurnAsResult);

  const lastStep = sortedSteps[sortedSteps.length - 1] ?? 0;
  return { messages, pendingToolUses, executedToolResults, step: lastStep, costUsd };
}

function toolTurnAsResult(t: TurnRecord): ToolResultBlockParam {
  const c = t.content as { tool_use_id: string; content: string };
  return { type: "tool_result", tool_use_id: c.tool_use_id, content: c.content };
}

async function loadRunInput(runId: string): Promise<unknown> {
  const { query } = await import("./db.js");
  const r = await query<{ input: unknown }>(`select input from runs where id = $1`, [runId]);
  return r.rows[0]?.input;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return false;
  if (typeof a !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

async function finish(
  runId: string,
  status: "succeeded" | "failed" | "budget_exceeded",
  payload: { result?: unknown; error?: string; cost: number; steps: number },
): Promise<void> {
  await updateRunStatus(runId, {
    status,
    finished_at: new Date(),
    result: payload.result ?? null,
    error: payload.error ?? null,
    cost_usd: payload.cost,
    step_count: payload.steps,
  });
}

function toolResultBlock(id: string, content: string, isError?: boolean): ToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: id,
    content,
    is_error: isError ?? false,
  };
}

function cacheable(text: string): TextBlockParam[] {
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

function cacheableTools(tools: Tool[]): Tool[] {
  if (tools.length === 0) return tools;
  return tools.map((t, i) =>
    i === tools.length - 1 ? ({ ...t, cache_control: { type: "ephemeral" } } as Tool) : t,
  );
}
