/**
 * Slack interactive integration — OAuth install + interaction handler.
 *
 * Mounted PUBLIC. Each handler enforces its own authenticity:
 *   GET  /v1/slack/install/start    — JWT-gated (we use the signed Clerk token
 *                                     in the query string from the web client)
 *   GET  /v1/slack/install/callback — Slack hits us with `code` and our `state`;
 *                                     we exchange and persist
 *   POST /v1/slack/interactions     — verified via x-slack-signature
 *
 * Slash commands and @-mentions land in this same router as Slack expands the
 * Block Kit set; v1 here is just buttons.
 */

import { Hono } from "hono";
import { verifyToken } from "@clerk/backend";
import { query, log, withTx } from "runtime";
import { runsQueue } from "../queue.js";
import { verifyClerkJwt, requireWorkspace } from "../middleware/auth.js";
import {
  verifySlackSignature,
  loadInstallationByTeam,
  completeOauthAndStore,
  updateApprovalCard,
  describeApproval,
} from "../services/slack-bot.js";

const SLACK_OAUTH_AUTHORIZE = "https://slack.com/oauth/v2/authorize";

// Bot scopes required for the v1 interactive surface (post + update cards,
// receive button clicks, post DM if no default channel is set).
const SLACK_BOT_SCOPES = [
  "chat:write",
  "chat:write.public",
  "commands",
  "im:write",
  "users:read",
].join(",");

export const slackRouter = new Hono();

// ===== OAuth install =====

/**
 * Begin the install flow. The web client redirects the user here with their
 * Clerk session token in the `?token=` query string (Slack swallows
 * Authorization headers across the redirect). We verify the token, resolve
 * the workspace, and 302 to Slack with `state=<workspace_id>` so the callback
 * can map the install back without trusting the browser.
 *
 * State is short-lived (5 min) and bound to the workspace_id only — Slack's
 * own CSRF protection covers redirect tampering.
 */
slackRouter.get("/install/start", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.text("missing token", 401);

  let clerkUserId: string;
  try {
    const payload = await verifyToken(token, { secretKey: need("CLERK_SECRET_KEY") });
    if (!payload.sub) return c.text("token has no subject", 401);
    clerkUserId = payload.sub;
  } catch (err) {
    return c.text(`invalid token: ${(err as Error).message}`, 401);
  }

  const ws = await query<{ workspace_id: string }>(
    `select w.id as workspace_id
       from users u
       join memberships m on m.user_id = u.id
       join workspaces w on w.id = m.workspace_id
      where u.clerk_user_id = $1
      order by w.created_at asc
      limit 1`,
    [clerkUserId],
  );
  const workspaceId = ws.rows[0]?.workspace_id;
  if (!workspaceId) return c.text("no workspace", 403);

  const url = new URL(SLACK_OAUTH_AUTHORIZE);
  url.searchParams.set("client_id", need("SLACK_CLIENT_ID"));
  url.searchParams.set("scope", SLACK_BOT_SCOPES);
  url.searchParams.set("redirect_uri", need("SLACK_REDIRECT_URI"));
  url.searchParams.set("state", workspaceId);

  return c.redirect(url.toString(), 302);
});

/**
 * OAuth callback. Exchange code for bot token; redirect back to /connect with
 * a flash flag so the UI can confirm the install.
 */
slackRouter.get("/install/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  const webUrl = process.env.WEB_URL ?? "http://localhost:3000";

  if (error) {
    log.warn({ error }, "slack install: user-side error");
    return c.redirect(`${webUrl}/connect?slack=error&reason=${encodeURIComponent(error)}`, 302);
  }
  if (!code || !state) {
    return c.redirect(`${webUrl}/connect?slack=error&reason=missing_code`, 302);
  }

  try {
    await completeOauthAndStore(code, state);
  } catch (err) {
    log.error({ err: (err as Error).message }, "slack install: exchange failed");
    return c.redirect(`${webUrl}/connect?slack=error&reason=exchange_failed`, 302);
  }

  return c.redirect(`${webUrl}/connect?slack=installed`, 302);
});

// ===== Interactions (button clicks) =====

interface SlackInteractionPayload {
  type: string;
  team?: { id: string };
  user?: { id: string; name?: string; username?: string };
  channel?: { id: string };
  message?: { ts: string };
  actions?: Array<{ action_id: string; value: string }>;
  response_url?: string;
}

/**
 * Slack posts interactions as `application/x-www-form-urlencoded` with a
 * single `payload` field whose value is the JSON. We verify the signature on
 * the RAW body (not the parsed form) before doing anything.
 *
 * Action IDs are formatted as `<verb>:<approval_id>` where verb is one of
 * `approve` | `reject`. We map back to the same /v1/approvals/:id/decide
 * logic — duplicating it here so the route stays self-contained without
 * cross-router HTTP calls.
 */
slackRouter.post("/interactions", async (c) => {
  const rawBody = await c.req.text();
  const ts = c.req.header("x-slack-request-timestamp");
  const sig = c.req.header("x-slack-signature");
  if (!verifySlackSignature(rawBody, ts, sig)) {
    log.warn("slack interactions: bad signature");
    return c.json({ error: "bad signature" }, 401);
  }

  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");
  if (!payloadStr) return c.json({ error: "no payload" }, 400);

  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(payloadStr) as SlackInteractionPayload;
  } catch {
    return c.json({ error: "bad payload json" }, 400);
  }

  if (payload.type !== "block_actions" || !payload.actions?.[0]) {
    return c.json({ ok: true });
  }

  const action = payload.actions[0];
  const [verb, approvalId] = action.action_id.split(":");
  if ((verb !== "approve" && verb !== "reject") || !approvalId) {
    return c.json({ ok: true });
  }

  const teamId = payload.team?.id;
  if (!teamId) return c.json({ error: "no team" }, 400);
  const install = await loadInstallationByTeam(teamId);
  if (!install) {
    log.warn({ teamId }, "slack interactions: no installation");
    return c.json({ error: "not installed" }, 404);
  }

  const status = verb === "approve" ? "approved" : "rejected";
  const decidedBy =
    payload.user?.name || payload.user?.username || payload.user?.id || "Slack user";

  const updated = await withTx(async (client) => {
    const r = await client.query<{
      run_id: string | null;
      task_phase_id: string | null;
      pending_tool_name: string | null;
      pending_tool_input: Record<string, unknown> | null;
      slack_channel_id: string | null;
      slack_message_ts: string | null;
    }>(
      `update approvals
          set status = $1,
              decided_at = now(),
              reject_reason = case when $1 = 'rejected' then 'Rejected from Slack' else null end
        where id = $2 and workspace_id = $3 and status = 'pending'
        returning run_id, task_phase_id, pending_tool_name, pending_tool_input,
                  slack_channel_id, slack_message_ts`,
      [status, approvalId, install.workspace_id],
    );
    return r.rows[0];
  });

  if (!updated) {
    // Already decided (race with web inbox) — still update the card so it's
    // visually consistent.
    if (payload.channel?.id && payload.message?.ts) {
      await updateApprovalCard({
        install,
        channel: payload.channel.id,
        ts: payload.message.ts,
        title: "(already decided)",
        decision: verb === "approve" ? "approved" : "rejected",
        decidedBy,
      }).catch(() => undefined);
    }
    return c.json({ ok: true, note: "already_decided" });
  }

  // Resume the run if it's a workflow-run approval. Task-phase approvals
  // wait for the orchestrator's next tick, same as the web path.
  if (updated.run_id) {
    if (verb === "reject") {
      await query(`update runs set status = 'cancelled', finished_at = now() where id = $1`, [
        updated.run_id,
      ]);
    } else {
      await runsQueue.add("resume", { runId: updated.run_id, workflowId: "", resume: true });
    }
  }

  // Update the Slack card so it's no longer actionable.
  const title = updated.pending_tool_name
    ? describeApproval(updated.pending_tool_name, updated.pending_tool_input ?? {})
    : "Approval";
  if (payload.channel?.id && payload.message?.ts) {
    await updateApprovalCard({
      install,
      channel: payload.channel.id,
      ts: payload.message.ts,
      title,
      decision: verb === "approve" ? "approved" : "rejected",
      decidedBy,
    }).catch((err) =>
      log.warn({ err: (err as Error).message }, "slack interactions: chat.update failed"),
    );
  }

  log.info(
    { approvalId, decision: status, by: decidedBy, workspace: install.workspace_id },
    "slack approval decided",
  );

  // Slack expects a 200 within 3s. Empty body is fine — we already updated
  // the message via chat.update.
  return c.json({ ok: true });
});

// ===== Status (auth-gated) =====
//
// Surfaced under /v1/slack/status. We mount a sub-app inside this router so
// the public OAuth + interactions paths remain auth-free.

const statusApp = new Hono();
statusApp.use("*", verifyClerkJwt);
statusApp.use("*", requireWorkspace);

statusApp.get("/", async (c) => {
  const workspaceId = c.get("workspace_id");
  const r = await query<{
    slack_team_id: string;
    bot_user_id: string;
    default_channel_id: string | null;
    updated_at: string;
  }>(
    `select slack_team_id, bot_user_id, default_channel_id, updated_at
       from slack_installations where workspace_id = $1`,
    [workspaceId],
  );
  const row = r.rows[0];
  if (!row) return c.json({ installed: false });
  return c.json({
    installed: true,
    slack_team_id: row.slack_team_id,
    default_channel_id: row.default_channel_id,
    updated_at: row.updated_at,
  });
});

slackRouter.route("/status", statusApp);

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}
