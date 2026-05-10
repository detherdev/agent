import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { query, withTx } from "runtime";
import { runsQueue } from "../queue.js";

const Decision = z.object({
  decision: z.enum(["approve", "reject", "edit"]),
  edited_input: z.unknown().optional(),
  reject_reason: z.string().optional(),
  user_id: z.string().uuid(),
});

export const approvalsRouter = new Hono();

approvalsRouter.get("/", async (c) => {
  const ws = c.req.query("workspace_id");
  if (!ws) return c.json({ error: "workspace_id required" }, 400);
  const r = await query(
    `select id, run_id, step, reason, pending_tool_name, pending_tool_input, created_at
       from approvals
      where workspace_id = $1 and status = 'pending'
      order by created_at asc`,
    [ws],
  );
  return c.json(r.rows);
});

approvalsRouter.post("/:id/decide", zValidator("json", Decision), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const status =
    body.decision === "approve" ? "approved" : body.decision === "edit" ? "edited" : "rejected";

  const updated = await withTx(async (client) => {
    const r = await client.query<{ run_id: string }>(
      `update approvals
          set status = $1,
              decided_by = $2,
              decided_at = now(),
              edited_input = $3,
              reject_reason = $4
        where id = $5 and status = 'pending'
        returning run_id`,
      [
        status,
        body.user_id,
        body.edited_input ? JSON.stringify(body.edited_input) : null,
        body.reject_reason ?? null,
        id,
      ],
    );
    return r.rows[0];
  });

  if (!updated) return c.json({ error: "approval not found or already decided" }, 404);

  if (body.decision === "reject") {
    await query(`update runs set status = 'cancelled', finished_at = now() where id = $1`, [updated.run_id]);
    return c.json({ ok: true, run_status: "cancelled" });
  }

  await runsQueue.add("resume", { runId: updated.run_id, workflowId: "", resume: true });
  return c.json({ ok: true, run_status: "resuming" });
});
