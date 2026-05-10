import type { MiddlewareHandler } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    workspace_id: string;
    user_id: string | null;
  }
}

/**
 * Resolve the calling workspace from request headers.
 *
 * v0 — trust the X-Workspace-Id and X-User-Id headers set by the web app
 * after Clerk auth. The web app is the only allowed caller in this slice.
 *
 * TODO (next slice): replace with verifying a Clerk session token and
 * resolving workspace via memberships. Until then, do NOT expose the API
 * to the public internet.
 */
export const workspaceContext: MiddlewareHandler = async (c, next) => {
  const workspaceId = c.req.header("x-workspace-id") ?? c.req.query("workspace_id");
  const userId = c.req.header("x-user-id") ?? null;

  if (workspaceId) c.set("workspace_id", workspaceId);
  if (userId) c.set("user_id", userId);

  await next();
};

export function requireWorkspace(c: {
  get: (key: "workspace_id") => string | undefined;
  json: (body: unknown, status: number) => Response;
}): string | Response {
  const id = c.get("workspace_id");
  if (!id) return c.json({ error: "workspace_id required" }, 400);
  return id;
}
