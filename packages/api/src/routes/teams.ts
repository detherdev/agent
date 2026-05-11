/**
 * Microsoft Teams Bot Framework webhook.
 *
 * Mounted PUBLIC. Each request is verified via Authorization: Bearer JWT
 * (verifyTeamsAuth — currently a soft check; TODO: full JWKS).
 *
 * Routes:
 *   POST /v1/teams/messages   — Bot Framework activity webhook (install,
 *                               message, invoke, adaptiveCard/action submit)
 *   GET  /v1/teams/status     — auth-gated; tells the web client whether
 *                               this workspace's Teams bot is installed
 *
 * Install model: when an admin adds the bot to a Teams channel, MS sends
 * us a `conversationUpdate` activity with `membersAdded` containing our
 * bot. We look up the workspace by the user who added the bot (matched
 * via AAD oid → users.email — same as Clerk lookup), persist
 * tenant_id + serviceUrl + conversation_id.
 */

import { Hono } from "hono";
import { query, log, withTx } from "runtime";
import { runsQueue } from "../queue.js";
import { verifyClerkJwt, requireWorkspace } from "../middleware/auth.js";
import {
  verifyTeamsAuth,
  loadInstallationByTenant,
  claimPending,
  completePendingFromActivity,
  updateApprovalCard,
  describeApproval,
} from "../services/teams-bot.js";

interface TeamsActivity {
  type: string;
  id?: string;
  serviceUrl?: string;
  channelId?: string;
  conversation?: { id: string; tenantId?: string };
  from?: { id: string; aadObjectId?: string; name?: string };
  recipient?: { id: string; name?: string };
  channelData?: {
    tenant?: { id: string };
    teamsChannelId?: string;
    eventType?: string;
  };
  membersAdded?: Array<{ id: string; aadObjectId?: string }>;
  value?: { verb?: string; approval_id?: string };
  text?: string;
  replyToId?: string;
}

export const teamsRouter = new Hono();

teamsRouter.post("/messages", async (c) => {
  const ok = await verifyTeamsAuth(c.req.header("authorization"));
  if (!ok) return c.json({ error: "unauthorized" }, 401);

  let activity: TeamsActivity;
  try {
    activity = (await c.req.json()) as TeamsActivity;
  } catch {
    return c.json({ error: "bad json" }, 400);
  }

  log.info(
    { type: activity.type, channelId: activity.channelId, conv: activity.conversation?.id },
    "teams: incoming activity",
  );

  switch (activity.type) {
    case "conversationUpdate":
      await handleInstall(activity);
      return c.json({ ok: true });
    case "message":
      // For v1, we only respond to button-submits via Action.Submit (which
      // arrive as `message` with `value` populated) and ignore plain text
      // (slash commands + @-mentions land here in v2).
      if (activity.value?.verb && activity.value.approval_id) {
        await handleApprovalSubmit(activity);
      }
      return c.json({ ok: true });
    case "invoke":
      // Some Adaptive Card actions arrive as "invoke" instead of "message"
      // depending on Teams client version. Handle the same way.
      if (activity.value?.verb && activity.value.approval_id) {
        await handleApprovalSubmit(activity);
      }
      return c.json({ ok: true });
    default:
      return c.json({ ok: true });
  }
});

// ===== Handlers =====

async function handleInstall(activity: TeamsActivity): Promise<void> {
  const tenantId = activity.conversation?.tenantId ?? activity.channelData?.tenant?.id;
  const serviceUrl = activity.serviceUrl;
  const conversationId = activity.conversation?.id ?? null;
  const channelId = activity.channelData?.teamsChannelId ?? null;
  const installer = activity.membersAdded?.find((m) => m.aadObjectId)?.aadObjectId ?? null;

  if (!tenantId || !serviceUrl) {
    log.warn({ activity }, "teams: install activity missing tenant/serviceUrl");
    return;
  }

  // The web app's "Install Teams" tile creates a `pending` row with
  // workspace_id ↔ tenant_id; the bot's first activity completes it. If
  // no pending row exists, the admin added the bot before claiming — log
  // and wait for the claim.
  const completed = await completePendingFromActivity({
    tenantId,
    serviceUrl,
    conversationId,
    channelId,
    installedBy: installer,
  });
  if (!completed) {
    log.warn({ tenantId, conversationId }, "teams: install received without prior claim — needs /settings/integrations/teams");
    return;
  }
  log.info(
    { workspace: completed.workspace_id, tenant: tenantId, channel: channelId },
    "teams: install completed",
  );
}

async function handleApprovalSubmit(activity: TeamsActivity): Promise<void> {
  const verb = activity.value?.verb;
  const approvalId = activity.value?.approval_id;
  if (!verb || !approvalId || (verb !== "approve" && verb !== "reject")) return;

  const tenantId = activity.conversation?.tenantId ?? activity.channelData?.tenant?.id;
  if (!tenantId) return;
  const install = await loadInstallationByTenant(tenantId);
  if (!install) return;

  const status = verb === "approve" ? "approved" : "rejected";
  const decidedBy = activity.from?.name ?? activity.from?.aadObjectId ?? "Teams user";

  const updated = await withTx(async (client) => {
    const r = await client.query<{
      run_id: string | null;
      task_phase_id: string | null;
      pending_tool_name: string | null;
      pending_tool_input: Record<string, unknown> | null;
      teams_conversation_id: string | null;
      teams_activity_id: string | null;
    }>(
      `update approvals
          set status = $1,
              decided_at = now(),
              reject_reason = case when $1 = 'rejected' then 'Rejected from Teams' else null end
        where id = $2 and workspace_id = $3 and status = 'pending'
        returning run_id, task_phase_id, pending_tool_name, pending_tool_input,
                  teams_conversation_id, teams_activity_id`,
      [status, approvalId, install.workspace_id],
    );
    return r.rows[0];
  });

  if (!updated) {
    // Already decided; still try to refresh the card so it doesn't keep
    // showing buttons.
    const conv = activity.conversation?.id;
    const replyTo = activity.replyToId;
    if (conv && replyTo) {
      await updateApprovalCard({
        install,
        conversationId: conv,
        activityId: replyTo,
        title: "(already decided)",
        decision: status,
        decidedBy,
      }).catch(() => undefined);
    }
    return;
  }

  // Resume run if applicable
  if (updated.run_id) {
    if (verb === "reject") {
      await query(`update runs set status = 'cancelled', finished_at = now() where id = $1`, [
        updated.run_id,
      ]);
    } else {
      await runsQueue.add("resume", { runId: updated.run_id, workflowId: "", resume: true });
    }
  }

  // Update the card so it stops being actionable.
  const title = updated.pending_tool_name
    ? describeApproval(updated.pending_tool_name, updated.pending_tool_input ?? {})
    : "Approval";
  const conv = updated.teams_conversation_id ?? activity.conversation?.id ?? null;
  const aid = updated.teams_activity_id ?? activity.replyToId ?? null;
  if (conv && aid) {
    await updateApprovalCard({
      install,
      conversationId: conv,
      activityId: aid,
      title,
      decision: status,
      decidedBy,
    }).catch((err) =>
      log.warn({ err: (err as Error).message, approvalId }, "teams: card update failed"),
    );
  }

  log.info({ approvalId, decision: status, by: decidedBy, workspace: install.workspace_id }, "teams approval decided");
}

// ===== Status + claim (auth-gated) =====
//
// Web client calls these to start and check the install:
//   POST /v1/teams/init  { tenant_id }     → creates a pending row
//   GET  /v1/teams/status                  → returns installed | pending | none

teamsRouter.get("/status", verifyClerkJwt, requireWorkspace, async (c) => {
  const workspaceId = c.get("workspace_id");
  const r = await query<{
    tenant_id: string;
    conversation_id: string | null;
    channel_id: string | null;
    status: "pending" | "active" | "revoked";
    updated_at: string;
  }>(
    `select tenant_id, conversation_id, channel_id, status, updated_at
       from teams_installations where workspace_id = $1`,
    [workspaceId],
  );
  const row = r.rows[0];
  if (!row) return c.json({ installed: false, status: "none" });
  return c.json({
    installed: row.status === "active",
    status: row.status,
    tenant_id: row.tenant_id,
    conversation_id: row.conversation_id,
    channel_id: row.channel_id,
    updated_at: row.updated_at,
  });
});

teamsRouter.post("/init", verifyClerkJwt, requireWorkspace, async (c) => {
  const workspaceId = c.get("workspace_id");
  let body: { tenant_id?: string };
  try {
    body = (await c.req.json()) as { tenant_id?: string };
  } catch {
    return c.json({ error: "bad json" }, 400);
  }
  const tenantId = body.tenant_id?.trim();
  if (!tenantId || !/^[0-9a-f-]{32,40}$/i.test(tenantId)) {
    return c.json({ error: "tenant_id must be a Microsoft Entra UUID" }, 400);
  }
  await claimPending({ workspaceId, tenantId });
  return c.json({ ok: true, status: "pending" });
});
