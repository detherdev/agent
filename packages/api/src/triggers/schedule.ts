import cronParser from "cron-parser";
import { query, log } from "runtime";
import { runsQueue } from "../queue.js";

interface ScheduleWorkflow {
  id: string;
  workspace_id: string;
  version: number;
  trigger_config: { cron?: string; timezone?: string };
  last_fired_at: Date | null;
  created_at: Date;
}

/**
 * Tick once: for every active schedule-triggered workflow, decide whether
 * its next cron fire-time has elapsed and enqueue a run if so.
 *
 * Idempotency is best-effort: if the worker dies after enqueueing a run
 * but before persisting last_fired_at, the next tick may double-fire. For
 * v0 that's acceptable — every workflow has a step/budget cap, and most
 * downstream tools are no-ops when nothing has changed.
 */
export async function scheduleTick(): Promise<void> {
  const now = new Date();
  const r = await query<ScheduleWorkflow>(
    `select id, workspace_id, version, trigger_config, last_fired_at, created_at
       from workflows
      where trigger_kind = 'schedule' and archived = false`,
    [],
  );

  for (const w of r.rows) {
    const cron = w.trigger_config?.cron;
    if (!cron) continue;
    const tz = w.trigger_config.timezone ?? "UTC";

    const since = w.last_fired_at ?? w.created_at;
    let nextFire: Date;
    try {
      const interval = cronParser.parseExpression(cron, { currentDate: since, tz });
      nextFire = interval.next().toDate();
    } catch (err) {
      log.warn({ workflow: w.id, cron, err: (err as Error).message }, "bad cron expression");
      continue;
    }

    if (nextFire > now) continue;

    await fireScheduledRun(w);
  }
}

async function fireScheduledRun(w: ScheduleWorkflow): Promise<void> {
  const ins = await query<{ id: string }>(
    `insert into runs (workflow_id, workspace_id, workflow_version, trigger_kind, input)
     values ($1,$2,$3,'schedule',$4)
     returning id`,
    [w.id, w.workspace_id, w.version, JSON.stringify({ as_of: new Date().toISOString() })],
  );
  const runId = ins.rows[0]!.id;
  await runsQueue.add("run", { runId, workflowId: w.id });
  await query(`update workflows set last_fired_at = now() where id = $1`, [w.id]);
  log.info({ workflow: w.id, run: runId }, "schedule fire");
}
