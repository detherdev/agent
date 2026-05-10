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
  const wf = await query<{ id: string; workspace_id: string; version: number }>(
    `select id, workspace_id, version from workflows where id = $1`,
    [body.workflow_id],
  );
  if (!wf.rows[0]) return c.json({ error: "workflow not found" }, 404);

  const ins = await query<{ id: string }>(
    `insert into runs (workflow_id, workspace_id, workflow_version, trigger_kind, input, shadow_mode)
     values ($1,$2,$3,'manual',$4,$5)
     returning id`,
    [
      body.workflow_id,
      wf.rows[0].workspace_id,
      wf.rows[0].version,
      JSON.stringify(body.input),
      body.shadow_mode ?? false,
    ],
  );
  const runId = ins.rows[0]!.id;

  await runsQueue.add("run", { runId, workflowId: body.workflow_id });

  return c.json({ run_id: runId, status: "queued" }, 202);
});

runsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const r = await query(`select * from runs where id = $1`, [id]);
  if (!r.rows[0]) return c.json({ error: "not found" }, 404);
  return c.json(r.rows[0]);
});

runsRouter.get("/:id/turns", async (c) => {
  const id = c.req.param("id");
  const r = await query(
    `select step, role, content, tool_name, tool_input, tool_result,
            input_tokens, output_tokens, cost_usd, duration_ms, created_at
       from turns where run_id = $1 order by step asc`,
    [id],
  );
  return c.json(r.rows);
});
