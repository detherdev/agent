import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  query,
  installWorkflow,
  Guardrails,
  ToolConfig,
  TriggerKind,
} from "runtime";
import {
  loadDraft,
  sendUserMessage,
  startDraft,
  GREETING,
} from "../services/setup-assistant.js";

export const specDraftsRouter = new Hono();

// Create a new draft for the auth'd user.
specDraftsRouter.post("/", async (c) => {
  const workspaceId = c.get("workspace_id");
  const userId = c.get("user_id");
  const draft = await startDraft(workspaceId, userId);
  return c.json({ ...draft, greeting: GREETING }, 201);
});

// List recent drafts (so user can resume).
specDraftsRouter.get("/", async (c) => {
  const workspaceId = c.get("workspace_id");
  const r = await query(
    `select id, status, proposed_spec, installed_workflow_id, updated_at
       from spec_drafts
      where workspace_id = $1 and status != 'archived'
      order by updated_at desc
      limit 25`,
    [workspaceId],
  );
  return c.json(r.rows);
});

specDraftsRouter.get("/:id", async (c) => {
  const workspaceId = c.get("workspace_id");
  const id = c.req.param("id");
  const draft = await loadDraft(id, workspaceId);
  if (!draft) return c.json({ error: "not found" }, 404);
  return c.json(draft);
});

const MessageBody = z.object({ text: z.string().min(1).max(8000) });

specDraftsRouter.post("/:id/messages", zValidator("json", MessageBody), async (c) => {
  const workspaceId = c.get("workspace_id");
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const result = await sendUserMessage(id, workspaceId, body.text);
  return c.json(result);
});

// Final commit: validate the proposed spec and create a real workflow.
specDraftsRouter.post("/:id/install", async (c) => {
  const workspaceId = c.get("workspace_id");
  const id = c.req.param("id");

  const draft = await loadDraft(id, workspaceId);
  if (!draft) return c.json({ error: "draft not found" }, 404);
  if (!draft.proposed_spec) return c.json({ error: "no proposed spec yet" }, 400);
  if (draft.status === "installed" && draft.installed_workflow_id) {
    return c.json({ workflow_id: draft.installed_workflow_id, already: true });
  }

  const spec = draft.proposed_spec as Record<string, unknown>;

  let triggerKind;
  let toolConfig;
  let guardrails;
  try {
    triggerKind = TriggerKind.parse(spec.trigger_kind);
    toolConfig = ToolConfig.parse(spec.tool_config ?? {});
    guardrails = Guardrails.parse(spec.guardrails ?? {});
  } catch (err) {
    return c.json({ error: `spec invalid: ${(err as Error).message}` }, 400);
  }

  const testCases = Array.isArray(spec.test_cases)
    ? (spec.test_cases as Array<{ name: string; input: unknown; rubric: string }>)
    : [];

  const result = await installWorkflow({
    workspaceId,
    name: String(spec.name ?? "Untitled"),
    goal: String(spec.goal ?? ""),
    inputSchema: (spec.input_schema as Record<string, unknown>) ?? {},
    triggerKind,
    triggerConfig: (spec.trigger_config as Record<string, unknown>) ?? {},
    toolConfig,
    guardrails,
    model: String(spec.model ?? "claude-sonnet-4-6"),
    plannerModel: typeof spec.planner_model === "string" ? spec.planner_model : null,
    testCases,
    // TODO: once the practice-run test page exists, install paused by
    // default and require explicit Activate after green evals.
  });

  await query(
    `update spec_drafts set status = 'installed', installed_workflow_id = $1, updated_at = now()
       where id = $2`,
    [result.workflow_id, id],
  );

  return c.json({
    workflow_id: result.workflow_id,
    test_case_count: result.test_case_count,
  });
});
