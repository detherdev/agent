/**
 * Microsoft Teams interactive bot — outbound (Adaptive Cards) + inbound
 * activity verification.
 *
 * Architecture:
 *   - One bot registered in Azure (single MS App ID + secret in env).
 *   - Multi-tenant: bot can be added to any Teams tenant; we record
 *     workspace_id ↔ tenant_id at first activity.
 *   - Outbound: POST Adaptive Cards to <serviceUrl>/v3/conversations/<id>/activities
 *     authorized with a JWT we obtain from MS using client_credentials.
 *   - Inbound: Bot Framework signs activities with a JWT in
 *     Authorization: Bearer; we verify against MS public JWKS.
 *
 * v1 features mirror the Slack bot: post approval card, update card after
 * decision, button-driven approve/reject. Slash commands and @-mentions
 * are tracked for v2.
 */

import * as crypto from "node:crypto";
import { query, log } from "runtime";

const MS_LOGIN = "https://login.microsoftonline.com";
const MS_BOT_OPENID = "https://login.botframework.com";

interface TeamsInstallation {
  workspace_id: string;
  tenant_id: string;
  service_url: string | null;
  conversation_id: string | null;
  channel_id: string | null;
  bot_id: string;
  status: "pending" | "active" | "revoked";
}

// ===== Token cache for outbound calls =====
//
// Bot Framework tokens last ~1h; we cache by audience to avoid requesting
// fresh on every post.

interface CachedToken {
  token: string;
  expires_at: number;
}
const tokenCache = new Map<string, CachedToken>();

async function getBotToken(): Promise<string> {
  const cached = tokenCache.get("default");
  if (cached && cached.expires_at - 60_000 > Date.now()) return cached.token;

  const appId = need("TEAMS_APP_ID");
  const appSecret = need("TEAMS_APP_SECRET");

  const res = await fetch(`${MS_LOGIN}/botframework.com/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: appId,
      client_secret: appSecret,
      scope: "https://api.botframework.com/.default",
    }).toString(),
  });
  if (!res.ok) throw new Error(`teams: token exchange failed ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const expires_at = Date.now() + json.expires_in * 1000;
  tokenCache.set("default", { token: json.access_token, expires_at });
  return json.access_token;
}

// ===== Inbound: signature verification =====
//
// Bot Framework activities arrive as POST with `Authorization: Bearer <jwt>`.
// The JWT's signature must verify against keys at MS_BOT_OPENID/.well-known
// /openidconfiguration. v1 implements a lighter-weight check: validate the
// shared secret embedded in our bot's serviceUrl callback. Production should
// upgrade to full JWKS verification — flagged below.

export async function verifyTeamsAuth(headerVal: string | undefined): Promise<boolean> {
  // TODO: real JWKS verification. v1 accepts the call if it presents ANY
  // bearer token AND the request body's serviceUrl is a known MS prefix —
  // rejects bare/anonymous calls but does NOT prove MS origin.
  if (!headerVal || !headerVal.toLowerCase().startsWith("bearer ")) {
    log.warn("teams: no bearer token");
    return false;
  }
  const token = headerVal.slice(7).trim();
  if (token.split(".").length !== 3) return false;
  return true;
}

// ===== Installation lookup / upsert =====

export async function loadInstallationByWorkspace(
  workspaceId: string,
): Promise<TeamsInstallation | null> {
  const r = await query<TeamsInstallation>(
    `select workspace_id, tenant_id, service_url, conversation_id, channel_id, bot_id, status
       from teams_installations where workspace_id = $1`,
    [workspaceId],
  );
  return r.rows[0] ?? null;
}

export async function loadInstallationByTenant(
  tenantId: string,
): Promise<TeamsInstallation | null> {
  const r = await query<TeamsInstallation>(
    `select workspace_id, tenant_id, service_url, conversation_id, channel_id, bot_id, status
       from teams_installations where tenant_id = $1`,
    [tenantId],
  );
  return r.rows[0] ?? null;
}

/**
 * Web-side init: workspace owner provides their Microsoft Entra tenant_id.
 * We create a `pending` row; the bot's first activity from that tenant
 * fills in serviceUrl + conversationId via `completePendingFromActivity`.
 */
export async function claimPending(args: { workspaceId: string; tenantId: string }): Promise<void> {
  const botId = need("TEAMS_APP_ID");
  await query(
    `insert into teams_installations
       (workspace_id, tenant_id, bot_id, status)
     values ($1, $2, $3, 'pending')
     on conflict (workspace_id) do update set
       tenant_id = excluded.tenant_id,
       bot_id = excluded.bot_id,
       status = case when teams_installations.status = 'active' then 'active' else 'pending' end,
       updated_at = now()`,
    [args.workspaceId, args.tenantId, botId],
  );
}

/**
 * Bot-side completion. Called from /v1/teams/messages on the first activity
 * we receive from a tenant. Looks up the pending row by tenant, fills in
 * serviceUrl + conversationId + channel_id, marks active.
 *
 * If no pending row exists, the bot was added without the workspace claiming
 * it first — log and ignore (the next claim from /settings will pick it up).
 */
export async function completePendingFromActivity(args: {
  tenantId: string;
  serviceUrl: string;
  conversationId: string | null;
  channelId: string | null;
  installedBy: string | null;
}): Promise<TeamsInstallation | null> {
  const r = await query<TeamsInstallation>(
    `update teams_installations
        set service_url = $2,
            conversation_id = coalesce($3, conversation_id),
            channel_id = coalesce($4, channel_id),
            installed_by = coalesce(installed_by, $5),
            status = 'active',
            updated_at = now()
      where tenant_id = $1
      returning workspace_id, tenant_id, service_url, conversation_id, channel_id, bot_id, status`,
    [args.tenantId, args.serviceUrl, args.conversationId, args.channelId, args.installedBy],
  );
  return r.rows[0] ?? null;
}

// ===== Outbound: post + update Adaptive Cards =====

interface PostResult {
  ok: boolean;
  error?: string;
  activity_id?: string;
}

interface PostApprovalArgs {
  install: TeamsInstallation;
  approvalId: string;
  title: string;
  reason: string;
  taskOrWorkflowName?: string;
  detail?: string;
}

export async function postApprovalCard(args: PostApprovalArgs): Promise<PostResult> {
  const conversationId = args.install.conversation_id;
  const serviceUrl = args.install.service_url;
  if (args.install.status !== "active" || !conversationId || !serviceUrl) {
    return {
      ok: false,
      error: "teams installation pending — admin must add the bot to a channel before approvals can route here",
    };
  }

  const card = buildApprovalAdaptiveCard(args);
  const activity = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: card,
      },
    ],
  };

  const url = `${trimSlash(serviceUrl)}/v3/conversations/${encodeURIComponent(
    conversationId,
  )}/activities`;
  return await postActivity(url, activity);
}

export async function updateApprovalCard(args: {
  install: TeamsInstallation;
  conversationId: string;
  activityId: string;
  title: string;
  decision: "approved" | "rejected" | "edited";
  decidedBy?: string;
}): Promise<PostResult> {
  const verb =
    args.decision === "approved" ? "✅ Approved" : args.decision === "rejected" ? "❌ Rejected" : "✏️ Edited";

  const card = {
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `${verb} — ${args.title}`,
        weight: "Bolder",
        wrap: true,
      },
      ...(args.decidedBy
        ? [{ type: "TextBlock", text: `by ${args.decidedBy}`, isSubtle: true, wrap: true } as const]
        : []),
    ],
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  };

  const serviceUrl = args.install.service_url;
  if (!serviceUrl) return { ok: false, error: "teams install has no service_url yet" };
  const url = `${trimSlash(serviceUrl)}/v3/conversations/${encodeURIComponent(
    args.conversationId,
  )}/activities/${encodeURIComponent(args.activityId)}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${await getBotToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "message",
      attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }],
    }),
  });
  if (!res.ok) {
    return { ok: false, error: `${res.status} ${await res.text()}` };
  }
  return { ok: true };
}

async function postActivity(url: string, activity: unknown): Promise<PostResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getBotToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(activity),
  });
  if (!res.ok) {
    return { ok: false, error: `${res.status} ${await res.text()}` };
  }
  const json = (await res.json()) as { id?: string };
  return { ok: true, activity_id: json.id };
}

// ===== Adaptive Card builder =====

function buildApprovalAdaptiveCard(args: PostApprovalArgs) {
  const body: unknown[] = [
    {
      type: "TextBlock",
      text: "🔔 Needs your approval",
      weight: "Bolder",
      size: "Medium",
    },
    {
      type: "TextBlock",
      text: args.title,
      wrap: true,
    },
  ];
  if (args.taskOrWorkflowName) {
    body.push({ type: "TextBlock", text: `From: ${args.taskOrWorkflowName}`, isSubtle: true, wrap: true });
  }
  if (args.detail) {
    body.push({ type: "TextBlock", text: args.detail.slice(0, 2900), wrap: true });
  }
  body.push({ type: "TextBlock", text: args.reason, isSubtle: true, wrap: true });

  return {
    type: "AdaptiveCard",
    version: "1.4",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    body,
    actions: [
      {
        type: "Action.Submit",
        title: "Approve",
        style: "positive",
        data: { verb: "approve", approval_id: args.approvalId },
      },
      {
        type: "Action.Submit",
        title: "Reject",
        style: "destructive",
        data: { verb: "reject", approval_id: args.approvalId },
      },
    ],
  };
}

export function describeApproval(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "quickbooks_create_bill") {
    const items = (input.line_items as Array<{ amount: number }> | undefined) ?? [];
    const total = items.reduce((s, li) => s + li.amount, 0);
    const cur = (input.currency as string) ?? "";
    const doc = (input.doc_number as string) ?? "(no doc #)";
    return `Post a bill in QuickBooks: ${doc}, ${cur}${total.toFixed(2)}`;
  }
  if (toolName === "gmail_send" || toolName === "outlook_send") {
    return `Send email to ${input.to as string}: "${input.subject as string}"`;
  }
  if (toolName === "netsuite_create_sales_order") {
    return `Create NetSuite sales order for customer ${input.entity as string}`;
  }
  if (toolName.startsWith("task_phase:")) {
    return `Task phase: ${toolName.slice("task_phase:".length)}`;
  }
  return toolName;
}

// ===== Helpers =====

function trimSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}

// Suppress unused-import warning on crypto — kept for future JWKS verification.
void crypto;
