import { authHeaders, type WorkspaceContext } from "./auth";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export interface PendingApproval {
  id: string;
  run_id: string | null;
  task_phase_id: string | null;
  step: number;
  reason: string;
  pending_tool_name: string;
  pending_tool_input: Record<string, unknown>;
  created_at: string;
  phase_name?: string | null;
  task_id?: string | null;
  task_name?: string | null;
}

export interface TaskListRow {
  id: string;
  template_slug: string | null;
  name: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface TaskPhaseRow {
  id: string;
  order_idx: number;
  name: string;
  workflow_id: string | null;
  human_gate: boolean;
  human_instructions: string | null;
  status: string;
  run_id: string | null;
  output: unknown;
  error: string | null;
  not_before: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface TaskDetail {
  task: {
    id: string;
    template_slug: string | null;
    name: string;
    status: string;
    input: Record<string, unknown>;
    state: Record<string, unknown>;
    result: unknown;
    error: string | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
  };
  phases: TaskPhaseRow[];
}

export interface TaskTemplateSummary {
  slug: string;
  name: string;
  tagline?: string;
  description?: string;
  input_schema: Record<string, unknown>;
  phase_count: number;
  phases: Array<{ name: string; human_gate: boolean; workflow_name?: string }>;
}

export async function listTaskTemplates(ctx: WorkspaceContext): Promise<TaskTemplateSummary[]> {
  const res = await fetch(`${API_URL}/v1/tasks/templates`, {
    cache: "no-store",
    headers: authHeaders(ctx),
  });
  if (!res.ok) throw new Error(`templates failed: ${res.status}`);
  return (await res.json()) as TaskTemplateSummary[];
}

export async function startTask(
  ctx: WorkspaceContext,
  template_slug: string,
  input: Record<string, unknown>,
  name?: string,
): Promise<{ task_id: string; phase_count: number }> {
  const res = await fetch(`${API_URL}/v1/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(ctx) },
    body: JSON.stringify({ template_slug, input, name }),
  });
  if (!res.ok) throw new Error(`start task failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { task_id: string; phase_count: number };
}

export async function listTasks(ctx: WorkspaceContext): Promise<TaskListRow[]> {
  const res = await fetch(`${API_URL}/v1/tasks`, {
    cache: "no-store",
    headers: authHeaders(ctx),
  });
  if (!res.ok) throw new Error(`tasks list failed: ${res.status}`);
  return (await res.json()) as TaskListRow[];
}

export async function getTask(ctx: WorkspaceContext, id: string): Promise<TaskDetail> {
  const res = await fetch(`${API_URL}/v1/tasks/${id}`, {
    cache: "no-store",
    headers: authHeaders(ctx),
  });
  if (!res.ok) throw new Error(`get task failed: ${res.status}`);
  return (await res.json()) as TaskDetail;
}

export async function cancelTask(ctx: WorkspaceContext, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/tasks/${id}/cancel`, {
    method: "POST",
    headers: authHeaders(ctx),
  });
  if (!res.ok) throw new Error(`cancel failed: ${res.status}`);
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

export interface WorkspaceStats {
  total_runs_30d: number;
  succeeded_30d: number;
  failed_30d: number;
  cancelled_30d: number;
  awaiting_approval: number;
  in_flight: number;
  cost_usd_30d: number;
  runs_24h: number;
  succeeded_24h: number;
  failed_24h: number;
  awaiting_24h: number;
  cost_usd_24h: number;
}

export async function getWorkspaceStats(ctx: WorkspaceContext): Promise<WorkspaceStats> {
  const res = await fetch(`${API_URL}/v1/stats/workspace`, {
    cache: "no-store",
    headers: authHeaders(ctx),
  });
  if (!res.ok) throw new Error(`workspace stats failed: ${res.status}`);
  return (await res.json()) as WorkspaceStats;
}

export interface WorkflowStats {
  id: string;
  name: string;
  trigger_kind: string;
  last_fired_at: string | null;
  runs_30d: number;
  succeeded_30d: number;
  failed_30d: number;
  awaiting_approval: number;
  cost_usd_30d: number;
  avg_duration_sec: number | null;
  p95_duration_sec: number | null;
  last_run_at: string | null;
  last_status: string | null;
}

export async function getWorkflowStats(ctx: WorkspaceContext): Promise<WorkflowStats[]> {
  const res = await fetch(`${API_URL}/v1/stats/workflows`, {
    cache: "no-store",
    headers: authHeaders(ctx),
  });
  if (!res.ok) throw new Error(`workflow stats failed: ${res.status}`);
  return (await res.json()) as WorkflowStats[];
}

export interface RunSummary {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  trigger_kind: string;
  cost_usd: string;
  step_count: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

export async function listRuns(
  ctx: WorkspaceContext,
  filters: { workflow_id?: string; status?: string; limit?: number } = {},
): Promise<RunSummary[]> {
  const url = new URL(`${API_URL}/v1/runs`);
  if (filters.workflow_id) url.searchParams.set("workflow_id", filters.workflow_id);
  if (filters.status) url.searchParams.set("status", filters.status);
  if (filters.limit) url.searchParams.set("limit", String(filters.limit));
  const res = await fetch(url, { cache: "no-store", headers: authHeaders(ctx) });
  if (!res.ok) throw new Error(`runs list failed: ${res.status}`);
  return (await res.json()) as RunSummary[];
}

export interface RunDetail {
  id: string;
  workflow_id: string;
  workspace_id: string;
  status: string;
  trigger_kind: string;
  input: unknown;
  result: unknown;
  error: string | null;
  cost_usd: string;
  step_count: number;
  shadow_mode: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export async function getRun(ctx: WorkspaceContext, runId: string): Promise<RunDetail> {
  const res = await fetch(`${API_URL}/v1/runs/${runId}`, {
    cache: "no-store",
    headers: authHeaders(ctx),
  });
  if (!res.ok) throw new Error(`run fetch failed: ${res.status}`);
  return (await res.json()) as RunDetail;
}

export interface TurnRow {
  step: number;
  role: "assistant" | "tool" | "user" | "system";
  content: unknown;
  tool_name: string | null;
  tool_input: unknown;
  tool_result: unknown;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | null;
  duration_ms: number | null;
  created_at: string;
}

export async function getRunTurns(ctx: WorkspaceContext, runId: string): Promise<TurnRow[]> {
  const res = await fetch(`${API_URL}/v1/runs/${runId}/turns`, {
    cache: "no-store",
    headers: authHeaders(ctx),
  });
  if (!res.ok) throw new Error(`turns fetch failed: ${res.status}`);
  return (await res.json()) as TurnRow[];
}

// ===== Setup Assistant (spec drafts) =====

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface SpecDraft {
  id: string;
  workspace_id: string;
  user_id: string;
  messages: unknown[];  // raw Anthropic message array
  proposed_spec: Record<string, unknown> | null;
  status: "drafting" | "ready" | "installed" | "archived";
  installed_workflow_id: string | null;
  greeting?: string;
}

export async function startSpecDraft(ctx: WorkspaceContext): Promise<SpecDraft> {
  const res = await fetch(`${API_URL}/v1/spec-drafts`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...authHeaders(ctx) },
  });
  if (!res.ok) throw new Error(`startSpecDraft failed: ${res.status}`);
  return (await res.json()) as SpecDraft;
}

export async function getSpecDraft(ctx: WorkspaceContext, id: string): Promise<SpecDraft> {
  const res = await fetch(`${API_URL}/v1/spec-drafts/${id}`, {
    cache: "no-store",
    headers: authHeaders(ctx),
  });
  if (!res.ok) throw new Error(`getSpecDraft failed: ${res.status}`);
  return (await res.json()) as SpecDraft;
}

export async function sendSpecDraftMessage(
  ctx: WorkspaceContext,
  id: string,
  text: string,
): Promise<{ assistant_message: string; proposed_spec_updated: boolean; draft: SpecDraft }> {
  const res = await fetch(`${API_URL}/v1/spec-drafts/${id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(ctx) },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`sendSpecDraftMessage failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as {
    assistant_message: string;
    proposed_spec_updated: boolean;
    draft: SpecDraft;
  };
}

export async function installSpecDraft(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ workflow_id: string; test_case_count: number }> {
  const res = await fetch(`${API_URL}/v1/spec-drafts/${id}/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(ctx) },
  });
  if (!res.ok) throw new Error(`install failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { workflow_id: string; test_case_count: number };
}

export function extractChatMessages(rawMessages: unknown[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of rawMessages) {
    const msg = m as { role: "user" | "assistant"; content: unknown };
    if (msg.role !== "user" && msg.role !== "assistant") continue;
    const text = extractText(msg.content);
    if (text) out.push({ role: msg.role, text });
  }
  return out;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => typeof b === "object" && b !== null && (b as { type: string }).type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");
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
