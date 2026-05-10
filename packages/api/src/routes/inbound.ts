import { Hono } from "hono";
import { query, log } from "runtime";
import { runsQueue } from "../queue.js";
import { checkPlanLimits, incrementRunCount } from "../services/usage-meter.js";

const MAX_ATTACHMENT_BYTES = Number(process.env.INBOUND_MAX_ATTACHMENT_BYTES ?? 20 * 1024 * 1024);

interface PostmarkAttachment {
  Name: string;
  ContentType: string;
  Content: string; // base64
  ContentLength: number;
}

interface PostmarkInbound {
  From?: string;
  FromName?: string;
  To?: string;
  ToFull?: Array<{ Email: string; Name?: string }>;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  MessageID?: string;
  Date?: string;
  Attachments?: PostmarkAttachment[];
}

/**
 * Inbound mail receiver — Postmark-shaped JSON. SES / Resend / Mailgun all
 * deliver similar payloads; map theirs in this handler if you switch.
 *
 * Auth model: HTTP Basic on the inbound URL. Customer sets
 * INBOUND_WEBHOOK_USER + INBOUND_WEBHOOK_PASSWORD on the API and uses the
 * same in their Postmark inbound stream config.
 *
 * Routing model: Postmark accepts mail for any address at our hosted MX
 * domain (e.g. *.inbox.yourdomain.com). It POSTs us each message; we look
 * up the workspace by `inbox_address` (case-insensitive prefix match before
 * the @). For each `inbound_email` workflow in that workspace, insert a
 * run with the parsed message + attachments and enqueue.
 *
 * Idempotency: dedup_key = `inbound:<MessageID>` per workflow; no
 * duplicate firing across retries.
 */
export const inboundRouter = new Hono();

inboundRouter.post("/", async (c) => {
  if (!verifyBasicAuth(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  let payload: PostmarkInbound;
  try {
    payload = (await c.req.json()) as PostmarkInbound;
  } catch {
    return c.json({ error: "bad json" }, 400);
  }

  const recipient = primaryRecipient(payload);
  if (!recipient) return c.json({ error: "no To address" }, 400);

  const inboxLocal = recipient.split("@")[0]?.toLowerCase();
  if (!inboxLocal) return c.json({ error: "bad To address" }, 400);

  const ws = await query<{ id: string; inbox_address: string }>(
    `select id, inbox_address from workspaces
       where lower(split_part(inbox_address, '@', 1)) = $1
       limit 1`,
    [inboxLocal],
  );
  const workspace = ws.rows[0];
  if (!workspace) {
    log.warn({ inboxLocal }, "inbound mail: no workspace");
    return c.json({ ok: true, ignored: "no workspace" });
  }

  const workflows = await query<{ id: string; version: number }>(
    `select id, version from workflows
       where workspace_id = $1 and trigger_kind = 'inbound_email'
         and archived = false and is_paused = false`,
    [workspace.id],
  );
  if (workflows.rows.length === 0) {
    log.info({ workspace: workspace.id }, "inbound mail: no inbound_email workflows");
    return c.json({ ok: true, ignored: "no workflows" });
  }

  const runInput = simplify(payload);
  const messageId = payload.MessageID ?? `${recipient}-${payload.Date ?? Date.now()}`;
  const dedupKey = `inbound:${messageId}`;

  // Plan check once per workspace — same workspace, same cap for all
  // workflows. If over cap, accept the webhook (don't let Postmark retry
  // forever) but log that we skipped.
  const check = await checkPlanLimits(workspace.id);
  if (!check.ok) {
    log.warn({ workspace: workspace.id, reason: check.reason }, "inbound_email: plan limit reached, skipping");
    return c.json({ ok: true, skipped: "plan_limit", reason: check.reason });
  }

  let enqueued = 0;
  for (const wf of workflows.rows) {
    const ins = await query<{ id: string }>(
      `insert into runs (workflow_id, workspace_id, workflow_version, trigger_kind, input, dedup_key)
         values ($1,$2,$3,'inbound_email',$4,$5)
       on conflict (workflow_id, dedup_key) where dedup_key is not null
         do nothing
       returning id`,
      [wf.id, workspace.id, wf.version, JSON.stringify(runInput), dedupKey],
    );
    if (ins.rows.length === 0) continue;
    const runId = ins.rows[0]!.id;
    await runsQueue.add("run", { runId, workflowId: wf.id });
    await incrementRunCount(workspace.id);
    enqueued += 1;
    log.info({ workspace: workspace.id, workflow: wf.id, run: runId, messageId }, "inbound_email fire");
  }

  return c.json({ ok: true, enqueued });
});

function verifyBasicAuth(header: string | undefined): boolean {
  const user = process.env.INBOUND_WEBHOOK_USER;
  const pass = process.env.INBOUND_WEBHOOK_PASSWORD;
  if (!user || !pass) {
    log.error("INBOUND_WEBHOOK_USER / INBOUND_WEBHOOK_PASSWORD not set — rejecting webhook");
    return false;
  }
  if (!header || !header.toLowerCase().startsWith("basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
    const [u, p] = decoded.split(":");
    return u === user && p === pass;
  } catch {
    return false;
  }
}

function primaryRecipient(p: PostmarkInbound): string | null {
  if (p.ToFull && p.ToFull[0]?.Email) return p.ToFull[0].Email;
  if (p.To) return p.To.split(",")[0]!.trim();
  return null;
}

function simplify(p: PostmarkInbound) {
  const attachments = (p.Attachments ?? [])
    .filter((a) => a.ContentLength <= MAX_ATTACHMENT_BYTES)
    .map((a) => ({
      name: a.Name,
      content_type: a.ContentType,
      content_base64: a.Content,
      size_bytes: a.ContentLength,
    }));
  return {
    from: p.From ?? "",
    from_name: p.FromName ?? "",
    subject: p.Subject ?? "",
    body: p.StrippedTextReply || p.TextBody || stripHtml(p.HtmlBody ?? ""),
    message_id: p.MessageID ?? "",
    date: p.Date ?? "",
    attachments,
    // Counts for the agent's awareness (it can reference attachments by index).
    attachment_count: attachments.length,
    skipped_attachments: (p.Attachments?.length ?? 0) - attachments.length,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
