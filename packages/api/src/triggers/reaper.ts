import { query, log } from "runtime";
import { runsQueue } from "../queue.js";

const STUCK_AFTER_MS = Number(process.env.RUN_STUCK_AFTER_MS ?? 10 * 60_000);

/**
 * Find runs that have been in `running` state for too long and re-enqueue
 * them. The worker's resume-on-crash path picks them up and rebuilds
 * messages from the persisted turns.
 *
 * We bump `started_at` on requeue so this same run won't be re-reaped on
 * the next tick before the worker has had time to grab it.
 */
export async function reaperTick(): Promise<void> {
  const r = await query<{ id: string; workflow_id: string }>(
    `update runs
        set started_at = now()
      where status = 'running'
        and started_at is not null
        and started_at < now() - interval '${STUCK_AFTER_MS} milliseconds'
      returning id, workflow_id`,
    [],
  );

  for (const row of r.rows) {
    await runsQueue.add("run", { runId: row.id, workflowId: row.workflow_id });
    log.warn({ run: row.id }, "reaped stuck run; re-enqueued for crash-resume");
  }

  if (r.rows.length > 0) {
    log.info({ reaped: r.rows.length }, "reaper sweep done");
  }
}
