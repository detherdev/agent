import { Hono } from "hono";
import { query } from "runtime";
import { runsQueue } from "../queue.js";
import { checkPlanLimits, incrementRunCount } from "../services/usage-meter.js";

export const webhooksRouter = new Hono();

webhooksRouter.post("/:workflow_id", async (c) => {
  const workflowId = c.req.param("workflow_id");
  const body = await c.req.json().catch(() => ({}));

  const wf = await query<{ id: string; workspace_id: string; version: number; trigger_kind: string }>(
    `select id, workspace_id, version, trigger_kind from workflows where id = $1`,
    [workflowId],
  );
  if (!wf.rows[0]) return c.json({ error: "workflow not found" }, 404);
  if (wf.rows[0].trigger_kind !== "webhook") {
    return c.json({ error: "workflow is not webhook-triggered" }, 400);
  }

  const check = await checkPlanLimits(wf.rows[0].workspace_id);
  if (!check.ok) {
    return c.json({ error: "plan_limit", reason: check.reason }, 402);
  }

  const ins = await query<{ id: string }>(
    `insert into runs (workflow_id, workspace_id, workflow_version, trigger_kind, input)
     values ($1,$2,$3,'webhook',$4)
     returning id`,
    [workflowId, wf.rows[0].workspace_id, wf.rows[0].version, JSON.stringify(body)],
  );
  const runId = ins.rows[0]!.id;

  await runsQueue.add("run", { runId, workflowId });
  await incrementRunCount(wf.rows[0].workspace_id);
  return c.json({ run_id: runId, status: "queued" }, 202);
});
