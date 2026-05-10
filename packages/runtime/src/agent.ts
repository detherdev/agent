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

import type { Workflow, ToolDefinition, ToolResult } from "./types.js";
import { buildToolset } from "./tools/index.js";
import { checkPreToolCall, checkPreTurn, redactPII } from "./guardrails.js";
import {
  appendTurn,
  createApproval,
  loadPendingApproval,
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
  /** When resuming after an approval, this is the approved (possibly edited) tool call. */
  resume?: { tool_use_id: string; tool_name: string; tool_input: unknown };
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
  const log = runLog(runId);

  const tools = await buildToolset(workflow.tool_config, workflow.workspace_id);
  const toolByName = new Map(tools.map((t) => [t.name, t]));
  const anthropicTools: Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Tool["input_schema"],
  }));

  const messages: MessageParam[] = [
    { role: "user", content: typeof input === "string" ? input : JSON.stringify(input) },
  ];

  await updateRunStatus(runId, { status: "running", started_at: new Date() });

  let step = 0;
  let costUsd = 0;
  const ctx = {
    run_id: runId,
    workflow_id: workflow.id,
    workspace_id: workflow.workspace_id,
    shadow_mode: shadowMode ?? workflow.guardrails.shadow_mode,
  };

  // Resume path: handle the prior approval before re-entering the loop.
  if (args.resume) {
    log.info({ resume: args.resume.tool_name }, "resuming after approval");
  }

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

/**
 * Resume an awaiting_approval run. Reads the latest approval row, applies
 * the (possibly edited) tool input, and re-enters the loop.
 * v0: stub — wire after approval routes ship.
 */
export async function resumeAfterApproval(runId: string, workflow: Workflow): Promise<RunAgentResult> {
  const approval = await loadPendingApproval(runId);
  if (!approval) throw new Error(`no approval found for run ${runId}`);
  if (approval.status !== "approved" && approval.status !== "edited") {
    throw new Error(`approval ${approval.id} is ${approval.status}`);
  }
  // TODO: rebuild messages from turns table and resume the loop with the
  // approved tool_use injected as the next assistant message.
  throw new Error("resumeAfterApproval not yet implemented");
}
