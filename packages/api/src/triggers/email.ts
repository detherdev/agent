import { query, log, nangoProxy, getConnection } from "runtime";
import { runsQueue } from "../queue.js";

interface EmailWorkflow {
  id: string;
  workspace_id: string;
  version: number;
  trigger_config: { label?: string; query?: string };
  last_polled_at: Date | null;
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
}

interface GmailMessageResponse {
  id: string;
  threadId: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType?: string; body?: { data?: string } }>;
  };
  snippet?: string;
}

/**
 * Tick once: for every active email-triggered workflow, poll the connected
 * Gmail account for messages newer than last_polled_at. Insert one run per
 * new message with dedup_key = "gmail:<message_id>". The unique index on
 * (workflow_id, dedup_key) means a duplicate trigger fire is a 0-row INSERT
 * — no double-processing even across worker restarts.
 *
 * First-time bootstrap: when last_polled_at is null we set it to "now"
 * without backfilling — Gmail history isn't useful as input for an
 * AI-driven workflow that's never seen this user's mail before.
 */
export async function emailTick(): Promise<void> {
  const now = new Date();
  const r = await query<EmailWorkflow>(
    `select id, workspace_id, version, trigger_config, last_polled_at
       from workflows
      where trigger_kind = 'email' and archived = false and is_paused = false`,
    [],
  );

  for (const w of r.rows) {
    try {
      await pollOne(w, now);
    } catch (err) {
      log.warn({ workflow: w.id, err: (err as Error).message }, "email poll failed");
    }
  }
}

async function pollOne(w: EmailWorkflow, now: Date): Promise<void> {
  const conn = await getConnection(w.workspace_id, "gmail");
  if (!conn) return;

  if (!w.last_polled_at) {
    await query(`update workflows set last_polled_at = $1 where id = $2`, [now, w.id]);
    return;
  }

  const sinceSec = Math.floor(w.last_polled_at.getTime() / 1000);
  const labelClause = w.trigger_config.label ? `label:${w.trigger_config.label} ` : "";
  const extra = w.trigger_config.query ? ` ${w.trigger_config.query}` : "";
  const q = `${labelClause}after:${sinceSec}${extra}`.trim();

  const list = await nangoProxy({
    workspaceId: w.workspace_id,
    provider: "gmail",
    method: "GET",
    endpoint: "/gmail/v1/users/me/messages",
    query: { q, maxResults: 25 },
  });
  if (!list.ok) {
    log.warn({ workflow: w.id, status: list.status }, "gmail list failed");
    return;
  }

  const data = list.data as GmailListResponse;
  const messages = data.messages ?? [];

  for (const m of messages) {
    const dedupKey = `gmail:${m.id}`;

    const detailRes = await nangoProxy({
      workspaceId: w.workspace_id,
      provider: "gmail",
      method: "GET",
      endpoint: `/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}`,
      query: { format: "full" },
    });
    if (!detailRes.ok) continue;
    const detail = detailRes.data as GmailMessageResponse;

    const input = simplifyMessage(detail);

    // ON CONFLICT DO NOTHING + RETURNING gives us back zero rows when the
    // dedup_key already exists. No row → no enqueue → no duplicate run.
    const ins = await query<{ id: string }>(
      `insert into runs (workflow_id, workspace_id, workflow_version, trigger_kind, input, dedup_key)
         values ($1,$2,$3,'email',$4,$5)
       on conflict (workflow_id, dedup_key) where dedup_key is not null
         do nothing
       returning id`,
      [w.id, w.workspace_id, w.version, JSON.stringify(input), dedupKey],
    );

    if (ins.rows.length === 0) {
      log.info({ workflow: w.id, message: m.id }, "email already processed, skipping");
      continue;
    }

    const runId = ins.rows[0]!.id;
    await runsQueue.add("run", { runId, workflowId: w.id });
    log.info({ workflow: w.id, run: runId, message: m.id }, "email trigger fire");
  }

  await query(`update workflows set last_polled_at = $1 where id = $2`, [now, w.id]);
}

function simplifyMessage(detail: GmailMessageResponse): {
  message_id: string;
  thread_id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
} {
  const headers = detail.payload?.headers ?? [];
  const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
  const body = decodeBody(detail);
  return {
    message_id: detail.id,
    thread_id: detail.threadId,
    from: h("from"),
    to: h("to"),
    subject: h("subject"),
    body,
  };
}

function decodeBody(detail: GmailMessageResponse): string {
  const candidate =
    detail.payload?.body?.data ??
    detail.payload?.parts?.find((p) => p.mimeType === "text/plain")?.body?.data ??
    detail.payload?.parts?.find((p) => p.mimeType === "text/html")?.body?.data;
  if (!candidate) return detail.snippet ?? "";
  try {
    return Buffer.from(candidate, "base64url").toString("utf8");
  } catch {
    return detail.snippet ?? "";
  }
}
