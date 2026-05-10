const API_URL = process.env.API_URL ?? "http://localhost:3001";
const WORKSPACE_ID = process.env.DEMO_WORKSPACE_ID ?? "";
const USER_ID = process.env.DEMO_USER_ID ?? "";

export function getDemoWorkspaceId(): string {
  return WORKSPACE_ID;
}

export interface PendingApproval {
  id: string;
  run_id: string;
  step: number;
  reason: string;
  pending_tool_name: string;
  pending_tool_input: Record<string, unknown>;
  created_at: string;
}

export async function listPendingApprovals(): Promise<PendingApproval[]> {
  const res = await fetch(`${API_URL}/v1/approvals?workspace_id=${WORKSPACE_ID}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`approvals fetch failed: ${res.status}`);
  return (await res.json()) as PendingApproval[];
}

export async function decideApproval(
  approvalId: string,
  decision: "approve" | "reject",
  rejectReason?: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/v1/approvals/${approvalId}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      decision,
      user_id: USER_ID,
      reject_reason: rejectReason,
    }),
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

export async function listCatalog(): Promise<CatalogJob[]> {
  const res = await fetch(`${API_URL}/v1/catalog?workspace_id=${WORKSPACE_ID}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  const body = (await res.json()) as { jobs: CatalogJob[] };
  return body.jobs;
}

export async function installCatalogJob(pack: string, slug: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/catalog/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace_id: WORKSPACE_ID, pack, slug }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`install failed: ${res.status} ${await res.text()}`);
  }
}
