/**
 * Subagent execution.
 *
 * A subagent is a child agent loop spawned by a parent's `delegate_subagent`
 * tool call. It shares the parent's workflow_id + workspace + tool config
 * (minus the delegate tool itself, so it can't recurse), but pivots the
 * goal + input to the child task.
 *
 * Cost & budget: the child's cost is added back into the parent's
 * accumulator by the calling tool. The parent's budget cap covers the
 * whole tree — a runaway child trips the cap and the parent stops.
 *
 * Approvals: subagents inherit the parent's guardrails BUT with the
 * approvals list cleared. v1 model is "if your work needs human approval,
 * the parent should be the one asking for it before/after delegating, not
 * the child mid-flight." Keeps the synchronous tool-call contract clean.
 */

import { runAgent } from "./agent.js";
import type { Workflow } from "./types.js";
import { withTx, query } from "./db.js";
import { log } from "./trace.js";

export interface SubagentResult {
  child_run_id: string;
  status: "succeeded" | "failed" | "budget_exceeded" | "awaiting_approval";
  result?: unknown;
  error?: string;
  cost_usd: number;
  step_count: number;
}

export interface RunSubagentArgs {
  parentWorkflow: Workflow;
  parentRunId: string;
  parentStep: number;
  goal: string;
  input: unknown;
  shadowMode: boolean;
}

/**
 * Spin up a child run, execute the agent loop synchronously, and return
 * the terminal state. The child gets its own runs row so traces are
 * separately inspectable; parent_run_id ties them together.
 */
export async function runSubagent(args: RunSubagentArgs): Promise<SubagentResult> {
  const childWorkflow: Workflow = {
    ...args.parentWorkflow,
    goal: args.goal,
    guardrails: {
      ...args.parentWorkflow.guardrails,
      // Clear approvals — subagents are pure-execution; a parent that wants
      // human review should ask before/after the delegate call.
      approvals: [],
      // Strip the delegate tool from the child's toolset to prevent recursion.
    },
    tool_config: {
      ...args.parentWorkflow.tool_config,
      builtins: args.parentWorkflow.tool_config.builtins.filter(
        (b) => b !== ("delegate_subagent" as never) && b !== ("delegate_parallel" as never),
      ),
    },
  };

  const childRunId = await withTx(async (client) => {
    const r = await client.query<{ id: string }>(
      `insert into runs
         (workflow_id, workspace_id, workflow_version, trigger_kind, input,
          status, shadow_mode, parent_run_id, parent_step)
       values ($1, $2, $3, 'manual', $4, 'queued', $5, $6, $7)
       returning id`,
      [
        args.parentWorkflow.id,
        args.parentWorkflow.workspace_id,
        args.parentWorkflow.version,
        JSON.stringify(args.input),
        args.shadowMode,
        args.parentRunId,
        args.parentStep,
      ],
    );
    return r.rows[0]!.id;
  });

  log.info(
    { parent: args.parentRunId, child: childRunId, goal: args.goal.slice(0, 80) },
    "subagent: starting",
  );

  try {
    const res = await runAgent({
      workflow: childWorkflow,
      runId: childRunId,
      input: args.input,
      shadowMode: args.shadowMode,
    });
    log.info(
      { parent: args.parentRunId, child: childRunId, status: res.status, cost: res.cost_usd },
      "subagent: finished",
    );
    return {
      child_run_id: childRunId,
      status: res.status,
      result: res.result,
      error: res.error,
      cost_usd: res.cost_usd,
      step_count: res.step_count,
    };
  } catch (err) {
    const message = (err as Error).message;
    log.error({ parent: args.parentRunId, child: childRunId, err: message }, "subagent: threw");
    await query(`update runs set status = 'failed', error = $1, finished_at = now() where id = $2`, [
      message,
      childRunId,
    ]);
    return {
      child_run_id: childRunId,
      status: "failed",
      error: message,
      cost_usd: 0,
      step_count: 0,
    };
  }
}
