import {
  query,
  log,
  loadActiveTasks,
  loadTaskPhases,
  markPhaseRunning,
  markPhaseAwaitingHuman,
  markPhaseSucceeded,
  markPhaseFailed,
  failOrRetryPhase,
  updateTaskStatus,
  type TaskPhaseRow,
  type TaskRow,
} from "runtime";
import { runsQueue } from "../queue.js";

/**
 * Task orchestrator tick.
 *
 * For every active task, walk the phases and decide what to advance:
 *   pending  → ready (if deps satisfied and not_before passed)
 *   ready    → running (workflow phase: fire run)
 *            → awaiting_human (human-gate phase: create approval)
 *   running  → succeeded (if the run finished cleanly)
 *            → failed    (if the run errored)
 *   awaiting_human → succeeded / failed (driven by approval decision)
 *
 * The task itself rolls up:
 *   all phases succeeded → task succeeded
 *   any phase failed     → task failed (no retry in v0)
 *   any phase awaiting_human → task awaiting_human
 *   any phase running    → task running
 */
export async function orchestratorTick(): Promise<void> {
  const tasks = await loadActiveTasks();
  for (const task of tasks) {
    try {
      await advanceTask(task);
    } catch (err) {
      log.error({ task: task.id, err: (err as Error).message }, "task tick failed");
    }
  }
}

async function advanceTask(task: TaskRow): Promise<void> {
  const phases = await loadTaskPhases(task.id);

  // Reap completed runs for any 'running' phase. Workflow-phase failures
  // route through failOrRetryPhase so retry budgets are honored.
  for (const p of phases) {
    if (p.status !== "running" || !p.run_id) continue;
    const r = await query<{ status: string; result: unknown; error: string | null }>(
      `select status, result, error from runs where id = $1`,
      [p.run_id],
    );
    const run = r.rows[0];
    if (!run) {
      await failOrRetryPhase(p, "run not found");
      continue;
    }
    if (run.status === "succeeded") {
      await markPhaseSucceeded(p.id, run.result);
    } else if (run.status === "failed" || run.status === "budget_exceeded" || run.status === "cancelled") {
      const reason = run.error ?? `run ended ${run.status}`;
      const retried = await failOrRetryPhase(p, reason);
      if (retried) {
        log.info({ phase: p.id, attempt: p.retry_count + 1, reason }, "task phase retry scheduled");
      }
    }
    // else: still queued/running/awaiting_approval — leave alone, next tick will check
  }

  // Reap human-gate phases when their approval has been decided.
  for (const p of phases) {
    if (p.status !== "awaiting_human") continue;
    const r = await query<{ status: string; reject_reason: string | null }>(
      `select status, reject_reason from approvals
        where task_phase_id = $1 and status != 'expired'
        order by created_at desc limit 1`,
      [p.id],
    );
    const a = r.rows[0];
    if (!a) continue;
    if (a.status === "approved" || a.status === "edited") {
      await markPhaseSucceeded(p.id, { approved: true });
    } else if (a.status === "rejected") {
      await markPhaseFailed(p.id, a.reject_reason ?? "rejected by human");
    }
  }

  // Re-load to see the reaper's effect.
  const after = await loadTaskPhases(task.id);

  // Promote pending phases whose deps are satisfied and not_before is past.
  const completedIdx = new Set(after.filter((p) => p.status === "succeeded").map((p) => p.order_idx));
  const failedIdx = new Set(after.filter((p) => p.status === "failed").map((p) => p.order_idx));

  if (failedIdx.size > 0) {
    // First failure stops the task. No retry in v0.
    await updateTaskStatus(task.id, {
      status: "failed",
      error: `phase ${[...failedIdx][0]} failed`,
      finished_at: new Date(),
    });
    return;
  }

  const now = new Date();
  for (const p of after) {
    if (p.status !== "pending") continue;
    const deps = p.depends_on;
    const depsOk = deps.every((d) => completedIdx.has(d));
    if (!depsOk) continue;
    if (p.not_before && p.not_before > now) continue;
    if (p.retry_after && p.retry_after > now) continue;

    if (p.human_gate) {
      await beginHumanGate(p, task);
    } else if (p.workflow_id) {
      await beginWorkflowPhase(p, task, after);
    } else {
      log.warn({ phase: p.id }, "phase has no workflow and is not a human gate; skipping");
      await markPhaseFailed(p.id, "phase has no workflow_id and is not a human gate");
    }
  }

  // Roll up status.
  const refreshed = await loadTaskPhases(task.id);
  const allDone = refreshed.every((p) => p.status === "succeeded");
  const anyHumanWaiting = refreshed.some((p) => p.status === "awaiting_human");
  const anyRunning = refreshed.some((p) => p.status === "running" || p.status === "ready");

  if (allDone) {
    const result = {
      phase_outputs: refreshed.map((p) => ({ name: p.name, output: p.output })),
    };
    await updateTaskStatus(task.id, {
      status: "succeeded",
      result,
      finished_at: new Date(),
    });
  } else if (anyHumanWaiting) {
    if (task.status !== "awaiting_human") {
      await updateTaskStatus(task.id, { status: "awaiting_human" });
    }
  } else if (anyRunning) {
    if (task.status !== "running") {
      await updateTaskStatus(task.id, { status: "running" });
    }
  }
}

async function beginWorkflowPhase(
  phase: TaskPhaseRow,
  task: TaskRow,
  allPhases: TaskPhaseRow[],
): Promise<void> {
  // Build the run input: phase's static input + the outputs of every prior
  // completed phase (so the workflow can reference them).
  const priorOutputs = allPhases
    .filter((p) => p.order_idx < phase.order_idx && p.status === "succeeded")
    .map((p) => ({ name: p.name, output: p.output }));

  const runInput = {
    task: { id: task.id, name: task.name, input: task.input },
    phase: { name: phase.name, input: phase.input ?? {} },
    prior_phases: priorOutputs,
  };

  // Mark phase ready inside a tx, insert a run row, enqueue.
  const r = await query<{ id: string; workflow_id: string; version: number; workspace_id: string }>(
    `select id, workflow_id, version, workspace_id from workflows where id = $1`,
    [phase.workflow_id],
  );
  const wf = r.rows[0];
  if (!wf) {
    await markPhaseFailed(phase.id, `workflow ${phase.workflow_id} not found`);
    return;
  }

  const ins = await query<{ id: string }>(
    `insert into runs (workflow_id, workspace_id, workflow_version, trigger_kind, input)
       values ($1,$2,$3,'manual',$4)
     returning id`,
    [wf.id, wf.workspace_id, wf.version, JSON.stringify(runInput)],
  );
  const runId = ins.rows[0]!.id;
  await runsQueue.add("run", { runId, workflowId: wf.id });
  await markPhaseRunning(phase.id, runId);
  log.info({ task: task.id, phase: phase.id, run: runId }, "task phase started");
}

async function beginHumanGate(phase: TaskPhaseRow, task: TaskRow): Promise<void> {
  await query(
    `insert into approvals (workspace_id, task_phase_id, step, reason, pending_tool_name, pending_tool_input)
       values ($1, $2, 0, $3, $4, '{}'::jsonb)`,
    [
      task.workspace_id,
      phase.id,
      phase.human_instructions ?? `Review phase: ${phase.name}`,
      `task_phase:${phase.name}`,
    ],
  );
  await markPhaseAwaitingHuman(phase.id);
  log.info({ task: task.id, phase: phase.id }, "task phase paused for human");
}
