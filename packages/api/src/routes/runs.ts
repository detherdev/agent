import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { query } from "runtime";
import { runsQueue } from "../queue.js";

const StartRun = z.object({
  workflow_id: z.string().uuid(),
  input: z.unknown(),
  shadow_mode: z.boolean().optional(),
});

export const runsRouter = new Hono();

runsRouter.post("/", zValidator("json", StartRun), async (c) => {
  const body = c.req.valid("json");
  const workspaceId = c.get("workspace_id");

  const wf = await query<{ id: string; workspace_id: string; version: number }>(
    `select id, workspace_id, version from workflows where id = $1`,
    [body.workflow_id],
  );
  const row = wf.rows[0];
  if (!row) return c.json({ error: "workflow not found" }, 404);
  if (row.workspace_id !== workspaceId) return c.json({ error: "forbidden" }, 403);

  const ins = await query<{ id: string }>(
    `insert into runs (workflow_id, workspace_id, workflow_version, trigger_kind, input, shadow_mode)
     values ($1,$2,$3,'manual',$4,$5)
     returning id`,
    [body.workflow_id, workspaceId, row.version, JSON.stringify(body.input), body.shadow_mode ?? false],
  );
  const runId = ins.rows[0]!.id;

  await runsQueue.add("run", { runId, workflowId: body.workflow_id });
  return c.json({ run_id: runId, status: "queued" }, 202);
});

runsRouter.get("/", async (c) => {
  const workspaceId = c.get("workspace_id");
  const workflowId = c.req.query("workflow_id");
  const status = c.req.query("status");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);

  const params: unknown[] = [workspaceId];
  const conds: string[] = ["r.workspace_id = $1"];
  if (workflowId) {
    params.push(workflowId);
    conds.push(`r.workflow_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conds.push(`r.status = $${params.length}`);
  }
  params.push(limit);
  const limitParam = `$${params.length}`;

  const r = await query(
    `select r.id, r.workflow_id, r.status, r.trigger_kind, r.cost_usd, r.step_count,
            r.created_at, r.started_at, r.finished_at, r.error,
            w.name as workflow_name
       from runs r
       join workflows w on w.id = r.workflow_id
      where ${conds.join(" and ")}
      order by r.created_at desc
      limit ${limitParam}`,
    params,
  );
  return c.json(r.rows);
});

runsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const workspaceId = c.get("workspace_id");
  const r = await query(`select * from runs where id = $1 and workspace_id = $2`, [id, workspaceId]);
  if (!r.rows[0]) return c.json({ error: "not found" }, 404);
  return c.json(r.rows[0]);
});

runsRouter.get("/:id/turns", async (c) => {
  const id = c.req.param("id");
  const workspaceId = c.get("workspace_id");
  const own = await query(`select 1 from runs where id = $1 and workspace_id = $2`, [id, workspaceId]);
  if (!own.rows[0]) return c.json({ error: "not found" }, 404);

  const r = await query(
    `select step, role, content, tool_name, tool_input, tool_result,
            input_tokens, output_tokens, cost_usd, duration_ms, created_at
       from turns where run_id = $1 order by step asc`,
    [id],
  );
  return c.json(r.rows);
});
