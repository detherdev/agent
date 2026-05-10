import { auth, currentUser } from "@clerk/nextjs/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export type PlanTier = "trial" | "starter" | "pro" | "enterprise";

export interface UsageSnapshot {
  runs_used: number;
  runs_cap: number;
  cost_used: number;
  cost_cap: number;
  period_end: string;
}

export interface WorkspaceContext {
  user_id: string;
  workspace_id: string;
  workspace_name: string;
  onboarding_step: number;
  inbox_address?: string | null;
  plan_tier: PlanTier;
  trial_ends_at: string | null;
  usage: UsageSnapshot | null;
  is_new: boolean;
  clerk_user_id: string;
  email: string;
  token: string;
}

/**
 * Server-side: ensure the signed-in Clerk user has a User row + Workspace +
 * Membership in our Postgres. Idempotent — safe to call on every request.
 *
 * The Clerk JWT is fetched via `auth().getToken()` and forwarded to the API
 * as `Authorization: Bearer <jwt>`; the API verifies the signature + sub
 * before touching the DB.
 */
export async function getOrCreateWorkspace(): Promise<WorkspaceContext | null> {
  const { userId, getToken } = await auth();
  if (!userId) return null;

  const token = await getToken();
  if (!token) return null;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  const res = await fetch(`${API_URL}/v1/me`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("getOrCreateWorkspace: /v1/me failed", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as Omit<WorkspaceContext, "clerk_user_id" | "email" | "token">;
  return { ...data, clerk_user_id: userId, email, token };
}

/** Auth headers for an API call from server components / actions. */
export function authHeaders(ctx: WorkspaceContext): Record<string, string> {
  return { Authorization: `Bearer ${ctx.token}` };
}
