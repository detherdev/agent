import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { query, Guardrails, ToolConfig, TriggerKind } from "runtime";

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

workflowsRouter.get("/", async (c) => {
  const workspaceId = c.get("workspace_id");
  const r = await query(
    `select id, name, trigger_kind, model, version, updated_at
       from workflows
      where workspace_id = $1 and archived = false
      order by updated_at desc`,
    [workspaceId],
  );
  return c.json(r.rows);
});
