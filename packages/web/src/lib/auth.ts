import { auth, currentUser } from "@clerk/nextjs/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export interface WorkspaceContext {
  user_id: string;
  workspace_id: string;
  workspace_name: string;
  onboarding_step: number;
  is_new: boolean;
  clerk_user_id: string;
  email: string;
}

/**
 * Server-side: ensure the signed-in Clerk user has a User row + Workspace +
 * Membership in our Postgres. Idempotent — safe to call on every request.
 */
export async function getOrCreateWorkspace(): Promise<WorkspaceContext | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  const res = await fetch(`${API_URL}/v1/me`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clerk_user_id: userId, email }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("getOrCreateWorkspace: /v1/me failed", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as Omit<WorkspaceContext, "clerk_user_id" | "email">;
  return { ...data, clerk_user_id: userId, email };
}

/**
 * Headers to send on every API call from server components / actions so the
 * (header-trusting) API knows which workspace this request is for.
 *
 * TODO: replace with a Clerk JWT once we add JWKS verification on the API.
 */
export function workspaceHeaders(ctx: WorkspaceContext): Record<string, string> {
  return {
    "X-Workspace-Id": ctx.workspace_id,
    "X-User-Id": ctx.user_id,
  };
}
