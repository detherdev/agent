import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { query, withTx } from "runtime";
import { requireWorkspace } from "../middleware/auth.js";

const BootstrapBody = z.object({
  email: z.string().email(),
  workspace_name: z.string().min(1).optional(),
});

interface MeResponse {
  user_id: string;
  workspace_id: string;
  workspace_name: string;
  onboarding_step: number;
  is_new: boolean;
}

export const meRouter = new Hono();

/**
 * Bootstrap (idempotent): ensures the verified Clerk user has a User row,
 * an owned Workspace, and a Membership. Returns identifiers + onboarding
 * progress so the web app can decide where to land.
 *
 * The clerk_user_id comes from the verified JWT (c.get('clerk_user_id')),
 * NOT from the body — clients can't claim a different identity.
 */
meRouter.post("/", zValidator("json", BootstrapBody), async (c) => {
  const body = c.req.valid("json");
  const clerkUserId = c.get("clerk_user_id");

  const result = await withTx(async (client) => {
    let isNew = false;

    let userRow = (
      await client.query<{ id: string }>(`select id from users where clerk_user_id = $1`, [
        clerkUserId,
      ])
    ).rows[0];

    if (!userRow) {
      isNew = true;
      userRow = (
        await client.query<{ id: string }>(
          `insert into users (clerk_user_id, email) values ($1, $2) returning id`,
          [clerkUserId, body.email],
        )
      ).rows[0]!;
    }

    let wsRow = (
      await client.query<{ id: string; name: string; onboarding_step: number }>(
        `select w.id, w.name, w.onboarding_step
           from workspaces w
           join memberships m on m.workspace_id = w.id
          where m.user_id = $1 and m.role = 'owner'
          order by w.created_at asc
          limit 1`,
        [userRow!.id],
      )
    ).rows[0];

    if (!wsRow) {
      const name = body.workspace_name ?? deriveName(body.email);
      const r = await client.query<{ id: string; name: string; onboarding_step: number }>(
        `insert into workspaces (name) values ($1) returning id, name, onboarding_step`,
        [name],
      );
      wsRow = r.rows[0]!;
      await client.query(
        `insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')
           on conflict do nothing`,
        [wsRow.id, userRow!.id],
      );
      isNew = true;
    }

    return { userRow, wsRow, isNew };
  });

  const out: MeResponse = {
    user_id: result.userRow!.id,
    workspace_id: result.wsRow.id,
    workspace_name: result.wsRow.name,
    onboarding_step: result.wsRow.onboarding_step,
    is_new: result.isNew,
  };
  return c.json(out);
});

const StepBody = z.object({ step: z.number().int().min(0).max(3) });

// Onboarding-step bumps need a real workspace, so layer the workspace
// middleware on this sub-route.
meRouter.post("/onboarding", requireWorkspace, zValidator("json", StepBody), async (c) => {
  const { step } = c.req.valid("json");
  const workspaceId = c.get("workspace_id");
  await query(`update workspaces set onboarding_step = $1 where id = $2`, [step, workspaceId]);
  return c.json({ ok: true });
});

function deriveName(email: string): string {
  const local = email.split("@")[0] ?? "workspace";
  return `${local}'s workspace`;
}
