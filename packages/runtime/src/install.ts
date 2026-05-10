import { readFile, readdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { withTx, query } from "./db.js";
import { Guardrails, ToolConfig, TriggerKind, type Workflow } from "./types.js";

export interface WorkflowInstallSpec {
  workspaceId: string;
  name: string;
  goal: string;
  inputSchema: Record<string, unknown>;
  triggerKind: Workflow["trigger_kind"];
  triggerConfig: Record<string, unknown>;
  toolConfig: Workflow["tool_config"];
  guardrails: Workflow["guardrails"];
  model: string;
  plannerModel: string | null;
  testCases: Array<{ name: string; input: unknown; rubric: string }>;
  /** If true, automated triggers (schedule/email/drive) skip this workflow until activated. */
  isPaused?: boolean;
}

export interface InstallResult {
  workflow_id: string;
  test_case_count: number;
}

/**
 * Insert a workflow + its test_cases into the workspace. Pure DB operation —
 * no filesystem reads. Reusable from CLI scripts and from API endpoints.
 */
export async function installWorkflow(spec: WorkflowInstallSpec): Promise<InstallResult> {
  return await withTx(async (client) => {
    const r = await client.query<{ id: string }>(
      `insert into workflows (workspace_id, name, goal, input_schema, trigger_kind,
                              trigger_config, tool_config, guardrails, model, planner_model,
                              is_paused)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning id`,
      [
        spec.workspaceId,
        spec.name,
        spec.goal,
        JSON.stringify(spec.inputSchema),
        spec.triggerKind,
        JSON.stringify(spec.triggerConfig),
        JSON.stringify(spec.toolConfig),
        JSON.stringify(spec.guardrails),
        spec.model,
        spec.plannerModel,
        spec.isPaused ?? false,
      ],
    );
    const workflowId = r.rows[0]!.id;

    for (const tc of spec.testCases) {
      await client.query(
        `insert into test_cases (workflow_id, name, input, rubric) values ($1,$2,$3,$4)`,
        [workflowId, tc.name, JSON.stringify(tc.input), tc.rubric],
      );
    }

    return { workflow_id: workflowId, test_case_count: spec.testCases.length };
  });
}

// ===== Filesystem helpers (load pack JSONs into install specs) =====

export interface PackJobMetadata {
  slug: string;                  // file basename without .json
  name: string;
  tagline?: string;
  description?: string;
  time_saved?: string;
  what_youll_connect?: string[];
  trigger_kind: Workflow["trigger_kind"];
  required_connectors: string[]; // derived from tool_config.connectors
}

export interface PackJobFile extends PackJobMetadata {
  spec: Omit<WorkflowInstallSpec, "workspaceId">;
}

interface RawWorkflowJson {
  name: string;
  tagline?: string;
  description?: string;
  time_saved?: string;
  what_youll_connect?: string[];
  trigger_kind: string;
  trigger_config?: Record<string, unknown>;
  input_schema?: Record<string, unknown>;
  tool_config: unknown;
  guardrails: unknown;
  model: string;
  planner_model?: string | null;
  system_prompt_path: string;
  test_cases?: Array<{ name: string; input: unknown; rubric: string }>;
}

export async function readPackJob(packDir: string, slug: string): Promise<PackJobFile> {
  const path = resolve(packDir, `${slug}.json`);
  const raw = JSON.parse(await readFile(path, "utf8")) as RawWorkflowJson;
  const systemPrompt = await readFile(join(dirname(path), raw.system_prompt_path), "utf8");

  const triggerKind = TriggerKind.parse(raw.trigger_kind);
  const toolConfig = ToolConfig.parse(raw.tool_config);
  const guardrails = Guardrails.parse(raw.guardrails);

  return {
    slug,
    name: raw.name,
    tagline: raw.tagline,
    description: raw.description,
    time_saved: raw.time_saved,
    what_youll_connect: raw.what_youll_connect,
    trigger_kind: triggerKind,
    required_connectors: toolConfig.connectors.map((c) => c.slug),
    spec: {
      name: raw.name,
      goal: systemPrompt,
      inputSchema: raw.input_schema ?? {},
      triggerKind,
      triggerConfig: raw.trigger_config ?? {},
      toolConfig,
      guardrails,
      model: raw.model,
      plannerModel: raw.planner_model ?? null,
      testCases: raw.test_cases ?? [],
    },
  };
}

export async function listPackJobs(packDir: string): Promise<PackJobMetadata[]> {
  const entries = await readdir(packDir);
  const slugs = entries.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  const jobs = await Promise.all(slugs.map((slug) => readPackJob(packDir, slug)));
  return jobs.map(({ spec, ...meta }) => meta);
}

export async function ensureWorkspace(workspaceId: string): Promise<void> {
  const r = await query(`select 1 from workspaces where id = $1`, [workspaceId]);
  if (r.rows.length === 0) {
    throw new Error(`workspace ${workspaceId} not found`);
  }
}

export async function isJobInstalled(workspaceId: string, jobName: string): Promise<boolean> {
  const r = await query(
    `select 1 from workflows where workspace_id = $1 and name = $2 and archived = false limit 1`,
    [workspaceId, jobName],
  );
  return r.rows.length > 0;
}
