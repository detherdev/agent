/**
 * Slack interactive integration — signing verification, Block Kit message
 * builders, and thin wrappers over chat.postMessage / chat.update.
 *
 * Direction: agent → Slack via this module's wrappers. Slack → us via
 * signature-verified routes in routes/slack.ts.
 */

import * as crypto from "node:crypto";
import { query, log } from "runtime";

const SLACK_API = "https://slack.com/api";

interface SlackInstallation {
  workspace_id: string;
  slack_team_id: string;
  bot_token: string;
  bot_user_id: string;
  default_channel_id: string | null;
}

// ===== Request signing (Slack → us) =====

/**
 * Verify x-slack-signature using SLACK_SIGNING_SECRET. Reject if older than
 * 5 minutes (replay protection) or signature mismatches. Constant-time
 * comparison.
 *
 * Pass the RAW request body (no JSON.parse first) — signature is computed
 * over bytes.
 */
export function verifySlackSignature(
  rawBody: string,
  timestamp: string | undefined,
  signature: string | undefined,
): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) {
    log.error("SLACK_SIGNING_SECRET not set — rejecting Slack request");
    return false;
  }
  if (!timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (Number.isNaN(ts)) return false;
  // Replay protection: anything older than 5 min is rejected.
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = "v0=" + crypto.createHmac("sha256", secret).update(base).digest("hex");
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ===== Installation lookup =====

export async function loadInstallationByWorkspace(
  workspaceId: string,
): Promise<SlackInstallation | null> {
  const r = await query<SlackInstallation>(
    `select workspace_id, slack_team_id, bot_token, bot_user_id, default_channel_id
       from slack_installations where workspace_id = $1`,
    [workspaceId],
  );
  return r.rows[0] ?? null;
}

export async function loadInstallationByTeam(
  slackTeamId: string,
): Promise<SlackInstallation | null> {
  const r = await query<SlackInstallation>(
    `select workspace_id, slack_team_id, bot_token, bot_user_id, default_channel_id
       from slack_installations where slack_team_id = $1`,
    [slackTeamId],
  );
  return r.rows[0] ?? null;
}

// ===== OAuth install =====

interface OauthAccessResponse {
  ok: boolean;
  error?: string;
  team: { id: string; name: string };
  enterprise: { id: string } | null;
  bot_user_id: string;
  access_token: string;       // bot token, xoxb-...
  authed_user: { id: string; access_token?: string; scope?: string };
  scope: string;
}

/**
 * Exchange the OAuth code Slack returned for a bot token, then upsert the
 * installation. Idempotent — re-installing replaces the row.
 */
export async function completeOauthAndStore(
  code: string,
  workspaceId: string,
): Promise<SlackInstallation> {
  const clientId = need("SLACK_CLIENT_ID");
  const clientSecret = need("SLACK_CLIENT_SECRET");
  const redirectUri = need("SLACK_REDIRECT_URI");

  const res = await fetch(`${SLACK_API}/oauth.v2.access`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
  });
  const data = (await res.json()) as OauthAccessResponse;
  if (!data.ok) throw new Error(`Slack oauth.v2.access failed: ${data.error ?? "unknown"}`);

  await query(
    `insert into slack_installations
       (workspace_id, slack_team_id, slack_enterprise_id, bot_user_id, bot_token,
        authed_user_id, authed_user_scope, scopes)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (workspace_id) do update set
       slack_team_id = excluded.slack_team_id,
       slack_enterprise_id = excluded.slack_enterprise_id,
       bot_user_id = excluded.bot_user_id,
       bot_token = excluded.bot_token,
       authed_user_id = excluded.authed_user_id,
       authed_user_scope = excluded.authed_user_scope,
       scopes = excluded.scopes,
       updated_at = now()`,
    [
      workspaceId,
      data.team.id,
      data.enterprise?.id ?? null,
      data.bot_user_id,
      data.access_token,
      data.authed_user.id,
      data.authed_user.scope ?? null,
      data.scope ? data.scope.split(",") : [],
    ],
  );

  log.info({ workspace: workspaceId, team: data.team.id }, "slack installed");
  return (await loadInstallationByWorkspace(workspaceId))!;
}

// ===== chat.postMessage / chat.update =====

interface PostResult {
  ok: boolean;
  error?: string;
  channel?: string;
  ts?: string;
}

async function callSlack(token: string, method: string, body: unknown): Promise<PostResult> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as PostResult;
}

interface PostApprovalArgs {
  install: SlackInstallation;
  approvalId: string;
  title: string;            // "Post a bill in QuickBooks: INV-7700, USD$4,250.00"
  reason: string;           // "Bill total exceeds $1000"
  taskOrWorkflowName?: string;
  detail?: string;          // optional extra context lines
}

/**
 * Post the initial approval card. Caller is responsible for storing the
 * returned channel/ts on the approval row so we can update later.
 */
export async function postApprovalCard(args: PostApprovalArgs): Promise<PostResult> {
  const channel = args.install.default_channel_id ?? args.install.bot_user_id; // DM the installer if no channel
  const blocks = buildApprovalBlocks(args);

  return await callSlack(args.install.bot_token, "chat.postMessage", {
    channel,
    blocks,
    text: `Needs your approval: ${args.title}`,
  });
}

/**
 * Update a previously-posted approval card after the user has decided.
 * Removes the buttons and shows who decided.
 */
export async function updateApprovalCard(args: {
  install: SlackInstallation;
  channel: string;
  ts: string;
  title: string;
  decision: "approved" | "rejected" | "edited";
  decidedBy?: string;        // email or "Slack user"
}): Promise<PostResult> {
  const verb =
    args.decision === "approved" ? "✅ Approved" : args.decision === "rejected" ? "❌ Rejected" : "✏️ Edited";

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${verb} — *${args.title}*` + (args.decidedBy ? `\n_by ${args.decidedBy}_` : ""),
      },
    },
  ];

  return await callSlack(args.install.bot_token, "chat.update", {
    channel: args.channel,
    ts: args.ts,
    blocks,
    text: `${verb} — ${args.title}`,
  });
}

function buildApprovalBlocks(args: PostApprovalArgs) {
  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🔔 Needs your approval", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${args.title}*` },
    },
  ];
  if (args.taskOrWorkflowName) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `From: ${args.taskOrWorkflowName}` }],
    });
  }
  if (args.detail) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: args.detail.slice(0, 2900) },
    });
  }
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `_${args.reason}_` }],
  });
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Approve" },
        style: "primary",
        value: args.approvalId,
        action_id: `approve:${args.approvalId}`,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Reject" },
        style: "danger",
        value: args.approvalId,
        action_id: `reject:${args.approvalId}`,
      },
    ],
  });
  return blocks;
}

// ===== Helpers =====

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
  if (toolName.startsWith("task_phase:")) {
    return `Task phase: ${toolName.slice("task_phase:".length)}`;
  }
  return toolName;
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}
