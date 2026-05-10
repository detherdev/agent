import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { query, withTx } from "runtime";
import { runsQueue } from "../queue.js";

const Decision = z.object({
  decision: z.enum(["approve", "reject", "edit"]),
  edited_input: z.unknown().optional(),
  reject_reason: z.string().optional(),
});

export const approvalsRouter = new Hono();

approvalsRouter.get("/", async (c) => {
  const workspaceId = c.get("workspace_id");
  const r = await query(
    `select a.id, a.run_id, a.task_phase_id, a.step, a.reason,
            a.pending_tool_name, a.pending_tool_input, a.created_at,
            tp.name as phase_name,
            t.id as task_id, t.name as task_name
       from approvals a
       left join task_phases tp on tp.id = a.task_phase_id
       left join tasks t on t.id = tp.task_id
      where a.workspace_id = $1 and a.status = 'pending'
      order by a.created_at asc`,
    [workspaceId],
  );
  return c.json(r.rows);
});

approvalsRouter.post("/:id/decide", zValidator("json", Decision), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const workspaceId = c.get("workspace_id");
  const userId = c.get("user_id");

  const status =
    body.decision === "approve" ? "approved" : body.decision === "edit" ? "edited" : "rejected";

  const updated = await withTx(async (client) => {
    const r = await client.query<{ run_id: string | null; task_phase_id: string | null }>(
      `update approvals
          set status = $1,
              decided_by = $2,
              decided_at = now(),
              edited_input = $3,
              reject_reason = $4
        where id = $5 and workspace_id = $6 and status = 'pending'
        returning run_id, task_phase_id`,
      [
        status,
        userId,
        body.edited_input ? JSON.stringify(body.edited_input) : null,
        body.reject_reason ?? null,
        id,
        workspaceId,
      ],
    );
    return r.rows[0];
  });

  if (!updated) return c.json({ error: "approval not found or already decided" }, 404);

  // Workflow-run approval: rejection cancels the run; approval re-queues
  // for resumeAfterApproval.
  if (updated.run_id) {
    if (body.decision === "reject") {
      await query(`update runs set status = 'cancelled', finished_at = now() where id = $1`, [
        updated.run_id,
      ]);
      return c.json({ ok: true, kind: "run", status: "cancelled" });
    }
    await runsQueue.add("resume", { runId: updated.run_id, workflowId: "", resume: true });
    return c.json({ ok: true, kind: "run", status: "resuming" });
  }

  // Task-phase approval: nothing to enqueue. The orchestrator tick picks
  // up the decision on its next pass and advances the phase.
  if (updated.task_phase_id) {
    return c.json({ ok: true, kind: "task_phase", status: body.decision });
  }

  return c.json({ ok: true });
});
