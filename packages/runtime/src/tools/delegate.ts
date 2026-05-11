/**
 * delegate_subagent + delegate_parallel — built-in tools that let the parent
 * agent spin up a child agent to handle a focused sub-task and return the
 * result inline.
 *
 * Use cases the agent should reach for delegation:
 *   - "process every invoice in this folder" → fan out one child per file
 *   - "research these 30 leads in parallel" → fan out one child per lead
 *   - "for each line item in this PO, look up the matching SKU"
 *
 * The child gets the parent's full tool config minus the delegate tools
 * themselves (no recursion in v1). Cost rolls into the parent's budget.
 *
 * Loading these tools requires a parent workflow context — they're
 * constructed in agent.ts via makeDelegateTools(workflow) at run start,
 * NOT via the standard BUILTINS map (which has no workflow access).
 */

import type { ToolDefinition, Workflow } from "../types.js";
import { runSubagent } from "../subagent.js";

export function makeDelegateTools(workflow: Workflow): ToolDefinition[] {
  return [
    {
      name: "delegate_subagent",
      description:
        "Spawn a child agent to do a focused sub-task and return its result. " +
        "Use when (a) the work has a clear sub-goal you can describe in 1 sentence " +
        "and (b) you'd otherwise pollute your own context with intermediate steps. " +
        "The child shares your tools (minus delegate itself) and returns its final answer. " +
        "Costs count against your run budget.",
      input_schema: {
        type: "object",
        properties: {
          goal: {
            type: "string",
            description:
              "One-sentence goal for the child agent (overrides the workflow goal for this child only).",
          },
          input: {
            description:
              "The structured input the child receives — typically a single item from your batch (one invoice, one lead, one PO line).",
          },
        },
        required: ["goal", "input"],
      },
      invoke: async (input, ctx) => {
        const v = input as { goal: string; input: unknown };
        const res = await runSubagent({
          parentWorkflow: workflow,
          parentRunId: ctx.run_id,
          parentStep: ctx.step,
          goal: v.goal,
          input: v.input,
          shadowMode: ctx.shadow_mode,
        });

        const summary =
          res.status === "succeeded"
            ? `child ${res.child_run_id} ok ($${res.cost_usd.toFixed(4)}, ${res.step_count} steps): ${truncate(stringify(res.result), 6000)}`
            : `child ${res.child_run_id} ${res.status}: ${truncate(res.error ?? "no error message", 1000)}`;
        return {
          content: summary,
          is_error: res.status !== "succeeded",
          meta: { child_run_id: res.child_run_id, cost_usd: res.cost_usd, status: res.status },
        };
      },
    },
    {
      name: "delegate_parallel",
      description:
        "Spawn N child agents at once and wait for all of them. Use for batch fan-out " +
        "(e.g. 50 invoices, 30 leads, 12 PO lines). Each task runs independently with " +
        "the same tool set; results return as an ordered array. Cost is the sum of all children.",
      input_schema: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            description: "Each task spawns one child. Order is preserved in the result.",
            items: {
              type: "object",
              properties: {
                goal: { type: "string" },
                input: {},
              },
              required: ["goal", "input"],
            },
            minItems: 1,
            maxItems: 50,
          },
        },
        required: ["tasks"],
      },
      invoke: async (input, ctx) => {
        const v = input as { tasks: Array<{ goal: string; input: unknown }> };
        const results = await Promise.all(
          v.tasks.map((t) =>
            runSubagent({
              parentWorkflow: workflow,
              parentRunId: ctx.run_id,
              parentStep: ctx.step,
              goal: t.goal,
              input: t.input,
              shadowMode: ctx.shadow_mode,
            }),
          ),
        );

        const totalCost = results.reduce((s, r) => s + r.cost_usd, 0);
        const failed = results.filter((r) => r.status !== "succeeded").length;
        const lines = results.map((r, i) =>
          r.status === "succeeded"
            ? `[${i}] ok: ${truncate(stringify(r.result), 1500)}`
            : `[${i}] ${r.status}: ${truncate(r.error ?? "no error", 400)}`,
        );
        return {
          content: `delegate_parallel: ${results.length - failed}/${results.length} ok, total cost $${totalCost.toFixed(4)}\n${lines.join("\n")}`,
          is_error: failed > 0,
          meta: {
            child_run_ids: results.map((r) => r.child_run_id),
            cost_usd: totalCost,
            failed,
          },
        };
      },
    },
  ];
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…[truncated, ${s.length - max} chars]`;
}
