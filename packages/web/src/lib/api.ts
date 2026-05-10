import { authHeaders, type WorkspaceContext } from "./auth";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export interface PendingApproval {
  id: string;
  run_id: string;
  step: number;
  reason: string;
  pending_tool_name: string;
  pending_tool_input: Record<string, unknown>;
  created_at: string;
}

export async function listPendingApprovals(ctx: WorkspaceContext): Promise<PendingApproval[]> {
  const res = await fetch(`${API_URL}/v1/approvals`, {
    cache: "no-store",
    headers: authHeaders(ctx),
  });
  if (!res.ok) throw new Error(`approvals fetch failed: ${res.status}`);
  return (await res.json()) as PendingApproval[];
}

export async function decideApproval(
  ctx: WorkspaceContext,
  approvalId: string,
  decision: "approve" | "reject",
  rejectReason?: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/v1/approvals/${approvalId}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(ctx) },
    body: JSON.stringify({ decision, reject_reason: rejectReason }),
  });
  if (!res.ok) throw new Error(`approval decide failed: ${res.status} ${await res.text()}`);
}

export interface CatalogJob {
  pack: string;
  slug: string;
  name: string;
  tagline?: string;
  description?: string;
  time_saved?: string;
  what_youll_connect?: string[];
  trigger_kind: string;
  required_connectors: string[];
  installed: boolean;
  installed_workflow_id?: string;
}

export async function listCatalog(ctx: WorkspaceContext): Promise<CatalogJob[]> {
  const res = await fetch(`${API_URL}/v1/catalog`, {
    cache: "no-store",
    headers: authHeaders(ctx),
  });
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  const body = (await res.json()) as { jobs: CatalogJob[] };
  return body.jobs;
}

export async function installCatalogJob(
  ctx: WorkspaceContext,
  pack: string,
  slug: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/v1/catalog/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(ctx) },
    body: JSON.stringify({ pack, slug }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`install failed: ${res.status} ${await res.text()}`);
  }
}

export interface RequiredProvider {
  provider: string;
  connected: boolean;
}

export async function listRequiredProviders(ctx: WorkspaceContext): Promise<RequiredProvider[]> {
  const res = await fetch(`${API_URL}/v1/connect/required`, {
    cache: "no-store",
    headers: authHeaders(ctx),
  });
  if (!res.ok) throw new Error(`required-providers fetch failed: ${res.status}`);
  return (await res.json()) as RequiredProvider[];
}

export async function createConnectSession(
  ctx: WorkspaceContext,
  providers: string[],
): Promise<{ session_token: string; expires_at: string }> {
  const res = await fetch(`${API_URL}/v1/connect/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(ctx) },
    body: JSON.stringify({
      workspace_id: ctx.workspace_id,
      end_user_id: ctx.clerk_user_id,
      end_user_email: ctx.email,
      providers,
    }),
  });
  if (!res.ok) throw new Error(`session creation failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { session_token: string; expires_at: string };
}

export async function setOnboardingStep(
  ctx: WorkspaceContext,
  step: 0 | 1 | 2 | 3,
): Promise<void> {
  const res = await fetch(`${API_URL}/v1/me/onboarding`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(ctx) },
    body: JSON.stringify({ step }),
  });
  if (!res.ok) throw new Error(`onboarding step failed: ${res.status}`);
}
