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
}

export async function getConnection(
  workspaceId: string,
  provider: string,
): Promise<ConnectionInfo | null> {
  const r = await query<ConnectionInfo>(
    `select nango_connection_id, provider, display_name
       from connections
      where workspace_id = $1 and provider = $2 and status = 'active'
      limit 1`,
    [workspaceId, provider],
  );
  return r.rows[0] ?? null;
}

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
