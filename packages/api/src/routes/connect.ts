import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as crypto from "node:crypto";
import {
  query,
  log,
  fetchNangoConnection,
  extractProviderMetadata,
} from "runtime";
import { requireMatchingWorkspace } from "../middleware/auth.js";

const NANGO_HOST = process.env.NANGO_HOST ?? "https://api.nango.dev";

function nangoSecret(): string {
  const s = process.env.NANGO_SECRET_KEY;
  if (!s) throw new Error("NANGO_SECRET_KEY not set");
  return s;
}

/**
 * HMAC-SHA256(body, NANGO_WEBHOOK_SECRET) — Nango sends the digest as
 * X-Nango-Signature. Constant-time compare. If the secret isn't configured
 * we log loudly and reject — never silently allow.
 */
function verifyNangoSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.NANGO_WEBHOOK_SECRET;
  if (!secret) {
    log.error("NANGO_WEBHOOK_SECRET not set — rejecting webhook");
    return false;
  }
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ===== Public: Nango webhook receiver =====
//
// Mounted before auth. TODO: verify Nango HMAC signature here using
// NANGO_WEBHOOK_SECRET so untrusted callers can't forge connection events.

const WebhookPayload = z
  .object({
    type: z.string(),
    operation: z.string().optional(),
    connectionId: z.string().optional(),
    providerConfigKey: z.string().optional(),
    endUser: z.object({ id: z.string().optional() }).optional(),
    error: z.unknown().optional(),
  })
  .passthrough();

export const connectWebhookRouter = new Hono();

connectWebhookRouter.post("/", async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header("x-nango-signature") ?? c.req.header("x-hub-signature-256");

  if (!verifyNangoSignature(rawBody, sig)) {
    log.warn("nango webhook: bad signature");
    return c.json({ error: "bad signature" }, 401);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "bad json" }, 400);
  }
  const parsed = WebhookPayload.safeParse(raw);
  if (!parsed.success) {
    log.warn({ raw }, "nango webhook: bad shape");
    return c.json({ ok: true });
  }
  const ev = parsed.data;
  log.info({ type: ev.type, op: ev.operation, conn: ev.connectionId }, "nango webhook");

  if (ev.type !== "auth" || !ev.connectionId || !ev.providerConfigKey) {
    return c.json({ ok: true });
  }

  // connection_id is `<workspace_id>:<provider>` per session creation.
  const [workspaceId] = ev.connectionId.split(":");
  if (!workspaceId) return c.json({ ok: true });

  if (ev.operation === "creation" || ev.operation === "refresh" || ev.operation === "override") {
    // Pull the full connection record from Nango so we can stash any
    // provider-specific metadata our tools need (e.g. QuickBooks realmId
    // lives in connection_config and won't appear in the webhook payload).
    let metadata: Record<string, unknown> = {};
    try {
      const detail = await fetchNangoConnection(ev.connectionId, ev.providerConfigKey);
      metadata = extractProviderMetadata(ev.providerConfigKey, detail);
    } catch (err) {
      log.warn(
        { err: (err as Error).message, conn: ev.connectionId },
        "fetchNangoConnection failed; persisting connection without metadata",
      );
    }

    await query(
      `insert into connections (workspace_id, provider, nango_connection_id, metadata, status)
         values ($1, $2, $3, $4, 'active')
       on conflict (workspace_id, provider)
         do update set nango_connection_id = excluded.nango_connection_id,
                       metadata = excluded.metadata,
                       status = 'active',
                       updated_at = now()`,
      [workspaceId, ev.providerConfigKey, ev.connectionId, JSON.stringify(metadata)],
    );
  } else if (ev.operation === "deletion") {
    await query(
      `update connections set status = 'revoked', updated_at = now()
        where workspace_id = $1 and provider = $2`,
      [workspaceId, ev.providerConfigKey],
    );
  }

  return c.json({ ok: true });
});

// ===== Authenticated: session creation, required-providers, current-state =====

export const connectRouter = new Hono();

const SessionBody = z.object({
  workspace_id: z.string().uuid(),
  end_user_id: z.string().min(1),
  end_user_email: z.string().email().optional(),
  providers: z.array(z.string()).min(1),
});

connectRouter.post("/session", zValidator("json", SessionBody), async (c) => {
  const body = c.req.valid("json");
  const ctxWs = c.get("workspace_id");
  const match = requireMatchingWorkspace({ workspace_id: ctxWs }, body.workspace_id);
  if (!match.ok) return c.json({ error: match.reason }, 403);

  const allowed = body.providers.map((p) => ({
    provider_config_key: p,
    connection_id: `${body.workspace_id}:${p}`,
  }));

  const res = await fetch(`${NANGO_HOST}/connect/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${nangoSecret()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      end_user: { id: body.end_user_id, email: body.end_user_email },
      allowed_integrations: body.providers,
      integrations_config_defaults: Object.fromEntries(
        allowed.map((a) => [a.provider_config_key, { connection_id: a.connection_id }]),
      ),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    log.error({ status: res.status, body: text }, "nango create session failed");
    return c.json({ error: "nango session creation failed", detail: text }, 500);
  }

  const json = (await res.json()) as { data: { token: string; expires_at: string } };
  return c.json({
    session_token: json.data.token,
    expires_at: json.data.expires_at,
    expected_connection_ids: allowed,
  });
});

connectRouter.get("/", async (c) => {
  const workspaceId = c.get("workspace_id");
  const r = await query<{
    provider: string;
    display_name: string | null;
    status: string;
    updated_at: string;
  }>(
    `select provider, display_name, status, updated_at
       from connections
      where workspace_id = $1
      order by provider`,
    [workspaceId],
  );
  return c.json(r.rows);
});

connectRouter.get("/required", async (c) => {
  const workspaceId = c.get("workspace_id");

  const r = await query<{ tool_config: { connectors?: Array<{ slug: string }> } }>(
    `select tool_config from workflows where workspace_id = $1 and archived = false`,
    [workspaceId],
  );

  const required = new Set<string>();
  for (const row of r.rows) {
    for (const c of row.tool_config.connectors ?? []) required.add(c.slug);
  }

  const conns = await query<{ provider: string; status: string }>(
    `select provider, status from connections where workspace_id = $1`,
    [workspaceId],
  );
  const active = new Set(conns.rows.filter((r) => r.status === "active").map((r) => r.provider));

  return c.json([...required].map((p) => ({ provider: p, connected: active.has(p) })));
});
