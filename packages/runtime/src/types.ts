import { z } from "zod";

export const TriggerKind = z.enum([
  "manual",
  "webhook",
  "schedule",
  "email",          // Polled Gmail label (existing)
  "inbound_email",  // Pushed via Postmark/SES into workspace inbox
  "drive_watch",    // Polled Google Drive folder
]);
export type TriggerKind = z.infer<typeof TriggerKind>;

export const ApprovalRule = z.object({
  tool: z.string(),
  when: z.string().optional(),
  reason: z.string(),
});
export type ApprovalRule = z.infer<typeof ApprovalRule>;

export const Guardrails = z.object({
  step_cap: z.number().int().positive().default(40),
  budget_usd: z.number().positive().default(0.5),
  approvals: z.array(ApprovalRule).default([]),
  shadow_mode: z.boolean().default(false),
  redact_pii: z.boolean().default(true),
});
export type Guardrails = z.infer<typeof Guardrails>;

export const McpServerRef = z.object({
  slug: z.string(),
});

export const ConnectorRef = z.object({
  slug: z.string(),
});

export const CustomTool = z.object({
  name: z.string(),
  description: z.string(),
  kind: z.enum(["http", "sql"]),
  config: z.record(z.unknown()),
  input_schema: z.record(z.unknown()),
});
export type CustomTool = z.infer<typeof CustomTool>;

export const BuiltinToolName = z.enum([
  "document_understand",
  "browser_use",
  "browser_action",
  "delegate_subagent",
  "delegate_parallel",
]);
export type BuiltinToolName = z.infer<typeof BuiltinToolName>;

export const ToolConfig = z.object({
  connectors: z.array(ConnectorRef).default([]),
  mcp_servers: z.array(McpServerRef).default([]),
  custom_tools: z.array(CustomTool).default([]),
  builtins: z.array(BuiltinToolName).default([]),
});
export type ToolConfig = z.infer<typeof ToolConfig>;

export const Workflow = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string(),
  goal: z.string(),
  input_schema: z.record(z.unknown()),
  trigger_kind: TriggerKind,
  trigger_config: z.record(z.unknown()),
  tool_config: ToolConfig,
  guardrails: Guardrails,
  model: z.string(),
  planner_model: z.string().nullable(),
  version: z.number().int(),
});
export type Workflow = z.infer<typeof Workflow>;

export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "budget_exceeded";

export interface Run {
  id: string;
  workflow_id: string;
  workspace_id: string;
  workflow_version: number;
  trigger_kind: TriggerKind;
  input: unknown;
  status: RunStatus;
  result: unknown;
  error: string | null;
  cost_usd: number;
  step_count: number;
  shadow_mode: boolean;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  invoke: (input: unknown, ctx: ToolInvocationContext) => Promise<ToolResult>;
}

export interface ToolInvocationContext {
  run_id: string;
  workflow_id: string;
  workspace_id: string;
  step: number;
  shadow_mode: boolean;
}

export interface ToolResult {
  content: string;
  is_error?: boolean;
  meta?: Record<string, unknown>;
}

export interface TurnRecord {
  step: number;
  role: "assistant" | "tool" | "user" | "system";
  content: unknown;
  tool_name?: string;
  tool_input?: unknown;
  tool_result?: unknown;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  cost_usd?: number;
  duration_ms?: number;
}
