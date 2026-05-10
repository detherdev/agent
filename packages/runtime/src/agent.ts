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

  const tools = await buildToolset(workflow.tool_config, workflow.workspace_id);
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
 * Resume an awaiting_approval run.
 * Strategy: rebuild messages from the turns table up through the last
 * assistant turn (which contains the un-executed tool_use(s)). Execute every
 * tool_use from that turn — using the approved/edited input for the one that
 * tripped the approval, and the original input for any siblings — then append
 * the resulting tool_result block(s) and re-enter the loop.
 */
export async function resumeAfterApproval(
  runId: string,
  workflow: Workflow,
): Promise<RunAgentResult> {
  const log = runLog(runId);

  const approval = await loadPendingApproval(runId);
  if (!approval) throw new Error(`no approval found for run ${runId}`);
  if (approval.status === "rejected" || approval.status === "expired") {
    throw new Error(`approval ${approval.id} is ${approval.status}; cannot resume`);
  }
  if (approval.status !== "approved" && approval.status !== "edited") {
    throw new Error(`approval ${approval.id} is still ${approval.status}; not ready to resume`);
  }

  await updateRunStatus(runId, { status: "running" });

  const tools = await buildToolset(workflow.tool_config, workflow.workspace_id);
  const toolByName = new Map(tools.map((t) => [t.name, t]));

  const turns = await loadTurns(runId);
  const initialInput = await loadRunInput(runId);

  const { messages, lastAssistantToolUses, step, costUsd } = rebuildMessages(turns, initialInput);

  if (!lastAssistantToolUses || lastAssistantToolUses.length === 0) {
    throw new Error(`no pending tool_uses found at step ${approval.step}; nothing to resume`);
  }

  const approvedInput = approval.status === "edited" ? approval.edited_input : approval.pending_tool_input;
  const ctx = {
    run_id: runId,
    workflow_id: workflow.id,
    workspace_id: workflow.workspace_id,
    shadow_mode: workflow.guardrails.shadow_mode,
  };

  const toolResults: ContentBlockParam[] = [];
  for (const tu of lastAssistantToolUses) {
    const isApproved =
      tu.name === approval.pending_tool_name && deepEqual(tu.input, approval.pending_tool_input);
    const useInput = isApproved ? approvedInput : tu.input;

    const tool = toolByName.get(tu.name);
    if (!tool) {
      toolResults.push(toolResultBlock(tu.id, `Unknown tool: ${tu.name}`, true));
      continue;
    }

    let res: ToolResult;
    try {
      res = await tool.invoke(useInput, { ...ctx, step });
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
      tool_input: useInput,
      tool_result: res,
    });
  }

  messages.push({ role: "user", content: toolResults });
  log.info({ resumed_step: step, tool_uses: lastAssistantToolUses.length }, "resumed after approval");

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
  lastAssistantToolUses: ToolUseBlock[] | null;
  step: number;
  costUsd: number;
}

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
  let lastAssistantToolUses: ToolUseBlock[] | null = null;

  for (const stepNum of sortedSteps) {
    const bucket = stepMap.get(stepNum)!;
    if (bucket.assistant) {
      const content = bucket.assistant.content as ToolUseBlock[] | TextBlock[];
      messages.push({ role: "assistant", content: content as never });
      costUsd += Number(bucket.assistant.cost_usd ?? 0);
      const toolUses = (content as Array<TextBlock | ToolUseBlock>).filter(
        (b): b is ToolUseBlock => b.type === "tool_use",
      );
      lastAssistantToolUses = toolUses.length ? toolUses : null;
    }
    if (bucket.tools.length > 0) {
      const toolResults: ToolResultBlockParam[] = bucket.tools.map((t) => {
        const c = t.content as { tool_use_id: string; content: string };
        return { type: "tool_result", tool_use_id: c.tool_use_id, content: c.content };
      });
      messages.push({ role: "user", content: toolResults });
      // If we have results for this step, the tool_uses already executed —
      // they don't need re-execution on resume.
      lastAssistantToolUses = null;
    }
  }

  const lastStep = sortedSteps[sortedSteps.length - 1] ?? 0;
  return { messages, lastAssistantToolUses, step: lastStep, costUsd };
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
