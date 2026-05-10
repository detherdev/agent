import type { MiddlewareHandler } from "hono";
import { verifyToken } from "@clerk/backend";
import { query } from "runtime";

declare module "hono" {
  interface ContextVariableMap {
    clerk_user_id: string;
    user_id: string;
    workspace_id: string;
  }
}

function clerkSecret(): string {
  const k = process.env.CLERK_SECRET_KEY;
  if (!k) throw new Error("CLERK_SECRET_KEY not set");
  return k;
}

/**
 * Verify a Clerk session JWT and attach `clerk_user_id` to the context.
 * 401 on missing / invalid / expired token.
 *
 * Mounts only on routes that require auth — public webhook receivers and
 * /health are routed before this middleware.
 */
export const verifyClerkJwt: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header("authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return c.json({ error: "missing bearer token" }, 401);
  }
  const token = auth.slice(7).trim();

  try {
    const payload = await verifyToken(token, { secretKey: clerkSecret() });
    if (!payload.sub) return c.json({ error: "token has no subject" }, 401);
    c.set("clerk_user_id", payload.sub);
  } catch (err) {
    return c.json({ error: "invalid token", detail: (err as Error).message }, 401);
  }

  await next();
};

/**
 * Resolve the verified Clerk user to an internal user_id + the workspace
 * they own. Multi-workspace users get their oldest owned workspace; we'll
 * surface a workspace switcher in a later slice.
 *
 * 403 if the user has no workspace yet (caller should hit /v1/me first).
 */
export const requireWorkspace: MiddlewareHandler = async (c, next) => {
  const clerkUserId = c.get("clerk_user_id");
  if (!clerkUserId) return c.json({ error: "no verified identity" }, 401);

  const r = await query<{ user_id: string; workspace_id: string }>(
    `select u.id as user_id, w.id as workspace_id
       from users u
       join memberships m on m.user_id = u.id
       join workspaces w on w.id = m.workspace_id
      where u.clerk_user_id = $1
      order by w.created_at asc
      limit 1`,
    [clerkUserId],
  );

  const row = r.rows[0];
  if (!row) {
    return c.json({ error: "no workspace; bootstrap via POST /v1/me first" }, 403);
  }

  c.set("user_id", row.user_id);
  c.set("workspace_id", row.workspace_id);
  await next();
};

/**
 * Reject if a body's `workspace_id` doesn't match the auth-resolved one.
 * Defends against IDOR — even with a valid JWT, a caller can't poke at
 * other tenants by passing their workspace_id in the body.
 */
export function requireMatchingWorkspace(
  context: { workspace_id: string },
  bodyWorkspaceId: string,
): { ok: true } | { ok: false; reason: string } {
  if (context.workspace_id !== bodyWorkspaceId) {
    return { ok: false, reason: "workspace_id mismatch" };
  }
  return { ok: true };
}
