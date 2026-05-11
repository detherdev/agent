import { query } from "../db.js";
import { log } from "../trace.js";

const NANGO_HOST = process.env.NANGO_HOST ?? "https://api.nango.dev";

function secret(): string {
  const s = process.env.NANGO_SECRET_KEY;
  if (!s) throw new Error("NANGO_SECRET_KEY not set");
  return s;
}

export interface ConnectionInfo {
  nango_connection_id: string;
  provider: string;
  display_name: string | null;
  metadata: Record<string, unknown>;
}

export async function getConnection(
  workspaceId: string,
  provider: string,
): Promise<ConnectionInfo | null> {
  const r = await query<ConnectionInfo>(
    `select nango_connection_id, provider, display_name, metadata
       from connections
      where workspace_id = $1 and provider = $2 and status = 'active'
      limit 1`,
    [workspaceId, provider],
  );
  return r.rows[0] ?? null;
}

// ===== Nango admin API (server → Nango) =====

export interface NangoConnectionDetails {
  connection_id: string;
  provider_config_key: string;
  connection_config: Record<string, unknown>;  // provider-specific (e.g. { realmId: "..." } for QB)
  metadata: Record<string, unknown>;
  end_user?: { id?: string; email?: string };
}

/**
 * Fetch the full connection record from Nango. Used right after a Connect
 * Session completes so we can extract per-provider context like the
 * QuickBooks realmId (which lives in `connection_config.realmId`).
 */
export async function fetchNangoConnection(
  connectionId: string,
  providerConfigKey: string,
): Promise<NangoConnectionDetails> {
  const url = new URL(`/connection/${encodeURIComponent(connectionId)}`, NANGO_HOST);
  url.searchParams.set("provider_config_key", providerConfigKey);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret()}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Nango GET /connection failed: ${res.status} ${body}`);
  }
  return (await res.json()) as NangoConnectionDetails;
}

/**
 * Provider-specific extraction from the full Nango connection record into
 * the metadata blob we persist on `connections.metadata`. Anything our tools
 * read at runtime should land here.
 */
export function extractProviderMetadata(
  provider: string,
  detail: NangoConnectionDetails,
): Record<string, unknown> {
  const cc = detail.connection_config ?? {};
  switch (provider) {
    case "quickbooks": {
      const realmId =
        (typeof cc.realmId === "string" && cc.realmId) ||
        (typeof cc.realm_id === "string" && cc.realm_id) ||
        null;
      return realmId ? { realm_id: realmId } : {};
    }
    case "gmail": {
      const email = typeof cc.email === "string" ? cc.email : undefined;
      return email ? { email } : {};
    }
    case "netsuite": {
      // NetSuite's account id arrives as `accountId` (sometimes `account_id`
      // depending on Nango integration template) — it doubles as the
      // suitetalk subdomain for every API call.
      const accountId =
        (typeof cc.accountId === "string" && cc.accountId) ||
        (typeof cc.account_id === "string" && cc.account_id) ||
        (typeof cc.account === "string" && cc.account) ||
        null;
      return accountId ? { account_id: accountId } : {};
    }
    case "plaid": {
      // Plaid's institution name is helpful UX context; access_token lives
      // in Nango's secure store and we never persist it.
      const institutionName = typeof cc.institution_name === "string" ? cc.institution_name : undefined;
      const itemId = typeof cc.item_id === "string" ? cc.item_id : undefined;
      const out: Record<string, unknown> = {};
      if (institutionName) out.institution_name = institutionName;
      if (itemId) out.item_id = itemId;
      return out;
    }
    default:
      return {};
  }
}

// ===== Proxy =====

export interface ProxyArgs {
  workspaceId: string;
  provider: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  endpoint: string;
  query?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  data?: unknown;
}

export interface ProxyResult {
  status: number;
  ok: boolean;
  data: unknown;
  raw: string;
}

/**
 * Forward an HTTP call to a connected provider via Nango's proxy. Nango
 * injects the OAuth token, refreshes it if needed, and rate-limits per
 * provider. We never see the raw token.
 */
export async function nangoProxy(args: ProxyArgs): Promise<ProxyResult> {
  const conn = await getConnection(args.workspaceId, args.provider);
  if (!conn) {
    return {
      status: 412,
      ok: false,
      data: { error: `provider ${args.provider} not connected for this workspace` },
      raw: "",
    };
  }

  const url = new URL(`/proxy${args.endpoint.startsWith("/") ? "" : "/"}${args.endpoint}`, NANGO_HOST);
  if (args.query) for (const [k, v] of Object.entries(args.query)) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    method: args.method,
    headers: {
      "Authorization": `Bearer ${secret()}`,
      "Connection-Id": conn.nango_connection_id,
      "Provider-Config-Key": args.provider,
      "Content-Type": "application/json",
      ...(args.headers ?? {}),
    },
    body: args.data == null ? undefined : JSON.stringify(args.data),
  });

  const raw = await res.text();
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!res.ok) {
    log.warn({ provider: args.provider, status: res.status, endpoint: args.endpoint }, "nango proxy non-2xx");
  }

  return { status: res.status, ok: res.ok, data, raw };
}

export function summarize(result: ProxyResult, label: string): string {
  if (!result.ok) return `${label} failed: HTTP ${result.status} ${truncate(result.raw, 1000)}`;
  return `${label} ok: ${truncate(typeof result.data === "string" ? result.data : JSON.stringify(result.data), 8000)}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…[truncated, ${s.length - max} bytes]`;
}
