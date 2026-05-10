import cronParser from "cron-parser";
import { withTx, log } from "runtime";
import { runsQueue } from "../queue.js";
import { checkPlanLimits, incrementRunCount } from "../services/usage-meter.js";

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
 * Concurrency safety:
 *   • The whole scan runs inside a single transaction with
 *     `SELECT ... FOR UPDATE SKIP LOCKED` so two trigger-worker instances
 *     get disjoint row sets — no double-firing.
 *   • Per-fire dedup_key is `<cron>@<fire_time_iso_to_minute>` and the
 *     unique index on (workflow_id, dedup_key) guarantees that even if the
 *     same workflow is somehow processed twice, only one run row exists.
 *   • BullMQ enqueue happens *after* commit. If the API process dies
 *     between commit and enqueue, the run sits in `queued` with no job;
 *     the reaper will pick it up.
 */
export async function scheduleTick(): Promise<void> {
  const now = new Date();

  const enqueues = await withTx(async (client) => {
    const r = await client.query<ScheduleWorkflow>(
      `select id, workspace_id, version, trigger_config, last_fired_at, created_at
         from workflows
        where trigger_kind = 'schedule' and archived = false and is_paused = false
        for update skip locked`,
    );

    const due: Array<{ id: string; runId: string; workspace_id: string }> = [];

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

      // Plan check before we even insert the run row. If the workspace is
      // over its cap, we silently skip this fire — last_fired_at stays put
      // so we'll try again on the next tick (giving the user a chance to
      // upgrade or wait for the period to roll).
      const check = await checkPlanLimits(w.workspace_id);
      if (!check.ok) {
        log.info(
          { workflow: w.id, workspace: w.workspace_id, reason: check.reason },
          "schedule trigger skipped: plan limit",
        );
        continue;
      }

      // Round to the minute so a 60s tick that fires twice within the same
      // minute (clock skew, restart) only produces one run row.
      const fireKey = nextFire.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
      const dedupKey = `schedule:${cron}@${fireKey}`;

      const ins = await client.query<{ id: string }>(
        `insert into runs (workflow_id, workspace_id, workflow_version, trigger_kind, input, dedup_key)
           values ($1,$2,$3,'schedule',$4,$5)
         on conflict (workflow_id, dedup_key) where dedup_key is not null
           do nothing
         returning id`,
        [
          w.id,
          w.workspace_id,
          w.version,
          JSON.stringify({ as_of: nextFire.toISOString() }),
          dedupKey,
        ],
      );

      if (ins.rows.length === 0) {
        // Another worker (or this one earlier) already inserted for this
        // fire-time; just bump last_fired_at and move on.
        await client.query(`update workflows set last_fired_at = $1 where id = $2`, [nextFire, w.id]);
        continue;
      }

      const runId = ins.rows[0]!.id;
      await client.query(`update workflows set last_fired_at = $1 where id = $2`, [nextFire, w.id]);
      due.push({ id: w.id, runId, workspace_id: w.workspace_id });
    }

    return due;
  });

  // Enqueue after the tx commits. If we crash here, the reaper recovers.
  for (const d of enqueues) {
    await runsQueue.add("run", { runId: d.runId, workflowId: d.id });
    await incrementRunCount(d.workspace_id);
    log.info({ workflow: d.id, run: d.runId }, "schedule fire");
  }
}
