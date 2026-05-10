import { query, log, nangoProxy, getConnection } from "runtime";
import { runsQueue } from "../queue.js";

interface EmailWorkflow {
  id: string;
  workspace_id: string;
  version: number;
  trigger_config: { label?: string; query?: string };
  last_polled_at: Date | null;
  trigger_state: { last_seen_message_ids?: string[] };
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
 * Gmail account for messages newer than last_polled_at that match the
 * configured label/query. Enqueue one run per new message.
 *
 * First-time bootstrap: when last_polled_at is null we set it to "now"
 * without backfilling — Gmail history isn't useful as input for an
 * AI-driven workflow that's never seen this user's mail before.
 */
export async function emailTick(): Promise<void> {
  const now = new Date();
  const r = await query<EmailWorkflow>(
    `select id, workspace_id, version, trigger_config, last_polled_at, trigger_state
       from workflows
      where trigger_kind = 'email' and archived = false`,
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
  const seenSet = new Set(w.trigger_state.last_seen_message_ids ?? []);

  let newSeen: string[] = [];

  for (const m of messages) {
    if (seenSet.has(m.id)) continue;
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
    const ins = await query<{ id: string }>(
      `insert into runs (workflow_id, workspace_id, workflow_version, trigger_kind, input)
         values ($1,$2,$3,'email',$4)
       returning id`,
      [w.id, w.workspace_id, w.version, JSON.stringify(input)],
    );
    const runId = ins.rows[0]!.id;
    await runsQueue.add("run", { runId, workflowId: w.id });
    log.info({ workflow: w.id, run: runId, message: m.id }, "email trigger fire");

    newSeen.push(m.id);
  }

  // Keep a sliding window of the last 200 ids so we don't refire the same
  // messages if Gmail's `after:` returns one already-processed message
  // due to second-resolution rounding.
  const merged = [...seenSet, ...newSeen].slice(-200);
  await query(
    `update workflows set last_polled_at = $1, trigger_state = $2 where id = $3`,
    [now, JSON.stringify({ ...w.trigger_state, last_seen_message_ids: merged }), w.id],
  );
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
