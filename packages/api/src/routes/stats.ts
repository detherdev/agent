import { Hono } from "hono";
import { query } from "runtime";

export const statsRouter = new Hono();

interface WorkspaceStatsRow {
  total_runs_30d: string;
  succeeded_30d: string;
  failed_30d: string;
  cancelled_30d: string;
  awaiting_approval: string;
  in_flight: string;
  cost_usd_30d: string;
  runs_24h: string;
  succeeded_24h: string;
  failed_24h: string;
  awaiting_24h: string;
  cost_usd_24h: string;
}

statsRouter.get("/workspace", async (c) => {
  const workspaceId = c.get("workspace_id");
  const r = await query<WorkspaceStatsRow>(
    `select
       count(*) filter (where created_at > now() - interval '30 days')                                           as total_runs_30d,
       count(*) filter (where created_at > now() - interval '30 days' and status = 'succeeded')                  as succeeded_30d,
       count(*) filter (where created_at > now() - interval '30 days' and status = 'failed')                     as failed_30d,
       count(*) filter (where created_at > now() - interval '30 days' and status = 'cancelled')                  as cancelled_30d,
       count(*) filter (where status = 'awaiting_approval')                                                       as awaiting_approval,
       count(*) filter (where status in ('queued','running'))                                                     as in_flight,
       coalesce(sum(cost_usd) filter (where created_at > now() - interval '30 days'), 0)                          as cost_usd_30d,
       count(*) filter (where created_at > now() - interval '24 hours')                                           as runs_24h,
       count(*) filter (where created_at > now() - interval '24 hours' and status = 'succeeded')                  as succeeded_24h,
       count(*) filter (where created_at > now() - interval '24 hours' and status = 'failed')                     as failed_24h,
       count(*) filter (where created_at > now() - interval '24 hours' and status = 'awaiting_approval')          as awaiting_24h,
       coalesce(sum(cost_usd) filter (where created_at > now() - interval '24 hours'), 0)                         as cost_usd_24h
       from runs
      where workspace_id = $1`,
    [workspaceId],
  );
  const row = r.rows[0]!;
  return c.json({
    total_runs_30d: Number(row.total_runs_30d),
    succeeded_30d: Number(row.succeeded_30d),
    failed_30d: Number(row.failed_30d),
    cancelled_30d: Number(row.cancelled_30d),
    awaiting_approval: Number(row.awaiting_approval),
    in_flight: Number(row.in_flight),
    cost_usd_30d: Number(row.cost_usd_30d),
    runs_24h: Number(row.runs_24h),
    succeeded_24h: Number(row.succeeded_24h),
    failed_24h: Number(row.failed_24h),
    awaiting_24h: Number(row.awaiting_24h),
    cost_usd_24h: Number(row.cost_usd_24h),
  });
});

interface WorkflowStatsRow {
  id: string;
  name: string;
  trigger_kind: string;
  last_fired_at: string | null;
  runs_30d: string;
  succeeded_30d: string;
  failed_30d: string;
  awaiting_approval: string;
  cost_usd_30d: string;
  avg_duration_sec: string | null;
  p95_duration_sec: string | null;
  last_run_at: string | null;
  last_status: string | null;
}

statsRouter.get("/workflows", async (c) => {
  const workspaceId = c.get("workspace_id");
  const r = await query<WorkflowStatsRow>(
    `with recent as (
       select * from runs
        where workspace_id = $1 and created_at > now() - interval '30 days'
     )
     select
       w.id, w.name, w.trigger_kind, w.last_fired_at,
       count(r.id)                                                                                  as runs_30d,
       count(r.id) filter (where r.status = 'succeeded')                                            as succeeded_30d,
       count(r.id) filter (where r.status = 'failed')                                               as failed_30d,
       count(r.id) filter (where r.status = 'awaiting_approval')                                    as awaiting_approval,
       coalesce(sum(r.cost_usd), 0)                                                                  as cost_usd_30d,
       avg(extract(epoch from (r.finished_at - r.started_at)))
         filter (where r.status = 'succeeded')                                                       as avg_duration_sec,
       percentile_cont(0.95) within group (order by extract(epoch from (r.finished_at - r.started_at)))
         filter (where r.status = 'succeeded')                                                       as p95_duration_sec,
       max(r.created_at)                                                                             as last_run_at,
       (select status from runs where workflow_id = w.id order by created_at desc limit 1)           as last_status
       from workflows w
       left join recent r on r.workflow_id = w.id
      where w.workspace_id = $1 and w.archived = false
      group by w.id
      order by w.name`,
    [workspaceId],
  );
  return c.json(
    r.rows.map((row) => ({
      id: row.id,
      name: row.name,
      trigger_kind: row.trigger_kind,
      last_fired_at: row.last_fired_at,
      runs_30d: Number(row.runs_30d),
      succeeded_30d: Number(row.succeeded_30d),
      failed_30d: Number(row.failed_30d),
      awaiting_approval: Number(row.awaiting_approval),
      cost_usd_30d: Number(row.cost_usd_30d),
      avg_duration_sec: row.avg_duration_sec == null ? null : Number(row.avg_duration_sec),
      p95_duration_sec: row.p95_duration_sec == null ? null : Number(row.p95_duration_sec),
      last_run_at: row.last_run_at,
      last_status: row.last_status,
    })),
  );
});
