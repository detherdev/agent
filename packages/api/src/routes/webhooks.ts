import { Hono } from "hono";
import { query } from "runtime";
import { runsQueue } from "../queue.js";

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

  const ins = await query<{ id: string }>(
    `insert into runs (workflow_id, workspace_id, workflow_version, trigger_kind, input)
     values ($1,$2,$3,'webhook',$4)
     returning id`,
    [workflowId, wf.rows[0].workspace_id, wf.rows[0].version, JSON.stringify(body)],
  );
  const runId = ins.rows[0]!.id;

  await runsQueue.add("run", { runId, workflowId });
  return c.json({ run_id: runId, status: "queued" }, 202);
});
