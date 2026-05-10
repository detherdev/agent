import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { resolve } from "node:path";
import {
  query,
  listTaskTemplates,
  readTaskTemplate,
  startTaskFromTemplate,
  loadTask,
  loadTaskPhases,
} from "runtime";

const PACKS_DIR = process.env.PACKS_DIR ?? resolve(process.cwd(), "packs");

export const tasksRouter = new Hono();

// List available task templates (across all packs on disk).
tasksRouter.get("/templates", async (c) => {
  const templates = await listTaskTemplates(PACKS_DIR);
  return c.json(
    templates.map((t) => ({
      slug: t.slug,
      name: t.name,
      tagline: t.tagline,
      description: t.description,
      input_schema: t.input_schema,
      phase_count: t.phases.length,
      phases: t.phases.map((p) => ({
        name: p.name,
        human_gate: p.human_gate,
        workflow_name: p.workflow_name,
      })),
    })),
  );
});

const StartBody = z.object({
  template_slug: z.string().min(1),
  name: z.string().min(1).optional(),
  input: z.record(z.unknown()).default({}),
});

tasksRouter.post("/", zValidator("json", StartBody), async (c) => {
  const body = c.req.valid("json");
  const workspaceId = c.get("workspace_id");

  let template;
  try {
    template = await readTaskTemplate(PACKS_DIR, body.template_slug);
  } catch (err) {
    return c.json({ error: `template not found: ${(err as Error).message}` }, 404);
  }

  try {
    const result = await startTaskFromTemplate({
      workspaceId,
      template,
      taskName: body.name ?? template.name,
      input: body.input,
    });
    return c.json(result, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// List recent tasks in the workspace.
tasksRouter.get("/", async (c) => {
  const workspaceId = c.get("workspace_id");
  const r = await query(
    `select id, template_slug, name, status, started_at, finished_at, created_at
       from tasks
      where workspace_id = $1
      order by created_at desc
      limit 100`,
    [workspaceId],
  );
  return c.json(r.rows);
});

tasksRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const workspaceId = c.get("workspace_id");
  const task = await loadTask(id, workspaceId);
  if (!task) return c.json({ error: "not found" }, 404);
  const phases = await loadTaskPhases(id);
  return c.json({ task, phases });
});

tasksRouter.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const workspaceId = c.get("workspace_id");
  const r = await query(
    `update tasks set status = 'cancelled', finished_at = now()
       where id = $1 and workspace_id = $2 and status in ('pending','running','awaiting_human')
       returning id`,
    [id, workspaceId],
  );
  if (r.rows.length === 0) return c.json({ error: "not found or already done" }, 404);
  return c.json({ ok: true });
});
