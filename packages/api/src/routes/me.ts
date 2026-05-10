import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { query, withTx, TRIAL_DURATION_DAYS, type PlanTier } from "runtime";
import { requireWorkspace } from "../middleware/auth.js";
import { loadUsageSnapshot } from "../services/usage-meter.js";

const BootstrapBody = z.object({
  email: z.string().email(),
  workspace_name: z.string().min(1).optional(),
});

interface MeResponse {
  user_id: string;
  workspace_id: string;
  workspace_name: string;
  onboarding_step: number;
  inbox_address: string | null;
  plan_tier: PlanTier;
  trial_ends_at: string | null;
  usage: {
    runs_used: number;
    runs_cap: number;
    cost_used: number;
    cost_cap: number;
    period_end: string;
  } | null;
  is_new: boolean;
}

const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN ?? "";

function generateInboxAddress(): string | null {
  if (!INBOUND_DOMAIN) return null;
  // Short random local part: wx- + 12 chars of base32-ish randomness.
  const chars = "23456789abcdefghjkmnpqrstuvwxyz";
  let local = "wx-";
  for (let i = 0; i < 12; i++) local += chars[Math.floor(Math.random() * chars.length)];
  return `${local}@${INBOUND_DOMAIN}`;
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
      await client.query<{
        id: string;
        name: string;
        onboarding_step: number;
        inbox_address: string | null;
        plan_tier: PlanTier;
        trial_ends_at: Date | null;
      }>(
        `select w.id, w.name, w.onboarding_step, w.inbox_address, w.plan_tier, w.trial_ends_at
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
      const inbox = generateInboxAddress();
      const trialEnds = new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
      const r = await client.query<{
        id: string;
        name: string;
        onboarding_step: number;
        inbox_address: string | null;
        plan_tier: PlanTier;
        trial_ends_at: Date | null;
      }>(
        `insert into workspaces (name, inbox_address, plan_tier, trial_ends_at)
           values ($1, $2, 'trial', $3)
           returning id, name, onboarding_step, inbox_address, plan_tier, trial_ends_at`,
        [name, inbox, trialEnds],
      );
      wsRow = r.rows[0]!;
      await client.query(
        `insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')
           on conflict do nothing`,
        [wsRow.id, userRow!.id],
      );
      isNew = true;
    } else if (!wsRow.inbox_address) {
      // Backfill an inbox for an existing workspace once the env var is set.
      const inbox = generateInboxAddress();
      if (inbox) {
        await client.query(`update workspaces set inbox_address = $1 where id = $2`, [inbox, wsRow.id]);
        wsRow.inbox_address = inbox;
      }
    }

    return { userRow, wsRow, isNew };
  });

  const usage = await loadUsageSnapshot(result.wsRow.id);

  const out: MeResponse = {
    user_id: result.userRow!.id,
    workspace_id: result.wsRow.id,
    workspace_name: result.wsRow.name,
    onboarding_step: result.wsRow.onboarding_step,
    inbox_address: result.wsRow.inbox_address,
    plan_tier: result.wsRow.plan_tier,
    trial_ends_at: result.wsRow.trial_ends_at ? result.wsRow.trial_ends_at.toISOString() : null,
    usage: usage
      ? {
          runs_used: usage.runs_used,
          runs_cap: usage.runs_cap,
          cost_used: usage.cost_used,
          cost_cap: usage.cost_cap,
          period_end: usage.period_end.toISOString(),
        }
      : null,
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
