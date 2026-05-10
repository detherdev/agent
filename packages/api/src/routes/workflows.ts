import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { query, Guardrails, ToolConfig, TriggerKind } from "runtime";
import { runTestPack } from "evals";

const NewWorkflow = z.object({
  name: z.string().min(1),
  goal: z.string().min(1),
  input_schema: z.record(z.unknown()).default({}),
  trigger_kind: TriggerKind,
  trigger_config: z.record(z.unknown()).default({}),
  tool_config: ToolConfig,
  guardrails: Guardrails,
  model: z.string().default("claude-sonnet-4-6"),
  planner_model: z.string().nullable().default(null),
});

export const workflowsRouter = new Hono();

workflowsRouter.post("/", zValidator("json", NewWorkflow), async (c) => {
  const body = c.req.valid("json");
  const workspaceId = c.get("workspace_id");

  const r = await query<{ id: string }>(
    `insert into workflows (workspace_id, name, goal, input_schema, trigger_kind,
                            trigger_config, tool_config, guardrails, model, planner_model)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning id`,
    [
      workspaceId,
      body.name,
      body.goal,
      JSON.stringify(body.input_schema),
      body.trigger_kind,
      JSON.stringify(body.trigger_config),
      JSON.stringify(body.tool_config),
      JSON.stringify(body.guardrails),
      body.model,
      body.planner_model,
    ],
  );
  return c.json({ id: r.rows[0]!.id }, 201);
});

workflowsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const workspaceId = c.get("workspace_id");
  const r = await query(
    `select * from workflows where id = $1 and workspace_id = $2`,
    [id, workspaceId],
  );
  const wf = r.rows[0];
  if (!wf) return c.json({ error: "not found" }, 404);
  return c.json(wf);
});

workflowsRouter.post("/:id/activate", async (c) => {
  const id = c.req.param("id");
  const workspaceId = c.get("workspace_id");
  const r = await query(
    `update workflows set is_paused = false, updated_at = now()
       where id = $1 and workspace_id = $2 and archived = false
       returning id`,
    [id, workspaceId],
  );
  if (r.rows.length === 0) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true, is_paused: false });
});

workflowsRouter.post("/:id/pause", async (c) => {
  const id = c.req.param("id");
  const workspaceId = c.get("workspace_id");
  const r = await query(
    `update workflows set is_paused = true, updated_at = now()
       where id = $1 and workspace_id = $2 and archived = false
       returning id`,
    [id, workspaceId],
  );
  if (r.rows.length === 0) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true, is_paused: true });
});

// Run the workflow's test pack synchronously in shadow mode. Returns one
// result per test case with pass/fail + Claude-judge reasoning + cost.
//
// v0 is synchronous — a 5-case pack typically takes 15–40 seconds. Past
// that, swap to a BullMQ job + polling/SSE endpoint.
workflowsRouter.post("/:id/eval", async (c) => {
  const id = c.req.param("id");
  const workspaceId = c.get("workspace_id");
  const own = await query(
    `select 1 from workflows where id = $1 and workspace_id = $2 and archived = false`,
    [id, workspaceId],
  );
  if (own.rows.length === 0) return c.json({ error: "not found" }, 404);

  try {
    const results = await runTestPack(id);
    const passed = results.filter((r) => r.passed).length;
    return c.json({
      total: results.length,
      passed,
      failed: results.length - passed,
      results,
    });
  } catch (err) {
    return c.json({ error: "eval failed", detail: (err as Error).message }, 500);
  }
});

workflowsRouter.get("/", async (c) => {
  const workspaceId = c.get("workspace_id");
  const r = await query(
    `select id, name, trigger_kind, model, version, is_paused, updated_at
       from workflows
      where workspace_id = $1 and archived = false
      order by updated_at desc`,
    [workspaceId],
  );
  return c.json(r.rows);
});
