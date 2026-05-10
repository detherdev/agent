import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { query, withTx } from "./db.js";

// ===== Task template schema =====

export const PhaseTemplate = z
  .object({
    name: z.string().min(1),
    /** Slug of an existing workflow in the same workspace (resolved by name). null for human-only phases. */
    workflow_name: z.string().nullable().optional(),
    human_gate: z.boolean().default(false),
    human_instructions: z.string().optional(),
    depends_on: z.array(z.number().int().nonnegative()).default([]),
    /** Static fields passed into the phase's workflow run as the input. */
    input: z.record(z.unknown()).default({}),
    /** Hours after task start before this phase is eligible. Useful for cool-off / next-day phases. */
    not_before_hours: z.number().nonnegative().optional(),
  })
  .refine(
    (p) => p.human_gate || !!p.workflow_name,
    { message: "Phase must either set human_gate=true or specify a workflow_name." },
  );
export type PhaseTemplate = z.infer<typeof PhaseTemplate>;

export const TaskTemplate = z.object({
  slug: z.string().min(1),  // e.g. 'bookkeeping/weekly-ar-review' (path-relative)
  name: z.string().min(1),
  tagline: z.string().optional(),
  description: z.string().optional(),
  input_schema: z.record(z.unknown()).default({}),
  phases: z.array(PhaseTemplate).min(1),
});
export type TaskTemplate = z.infer<typeof TaskTemplate>;

// ===== Filesystem loader =====

export async function listTaskTemplates(packsDir: string): Promise<TaskTemplate[]> {
  const out: TaskTemplate[] = [];
  let packs: string[];
  try {
    packs = await readdir(packsDir);
  } catch {
    return out;
  }

  for (const pack of packs) {
    const taskDir = join(packsDir, pack, "tasks");
    let entries: string[];
    try {
      const s = await stat(taskDir);
      if (!s.isDirectory()) continue;
      entries = await readdir(taskDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const slug = `${pack}/${entry.replace(/\.json$/, "")}`;
      const raw = JSON.parse(await readFile(join(taskDir, entry), "utf8"));
      out.push(TaskTemplate.parse({ ...raw, slug }));
    }
  }
  return out;
}

export async function readTaskTemplate(packsDir: string, slug: string): Promise<TaskTemplate> {
  const [pack, name] = slug.split("/");
  if (!pack || !name) throw new Error(`bad task slug: ${slug}`);
  const path = join(packsDir, pack, "tasks", `${name}.json`);
  const raw = JSON.parse(await readFile(path, "utf8"));
  return TaskTemplate.parse({ ...raw, slug });
}

// ===== Task install =====

export interface StartTaskArgs {
  workspaceId: string;
  template: TaskTemplate;
  taskName: string;
  input: Record<string, unknown>;
}

export interface StartTaskResult {
  task_id: string;
  phase_count: number;
}

/**
 * Create a task row and its phase rows. Phase workflow_id is resolved by
 * looking up workflows by name in the same workspace — keeps templates
 * portable across tenants while ensuring tenant isolation.
 */
export async function startTaskFromTemplate(args: StartTaskArgs): Promise<StartTaskResult> {
  return await withTx(async (client) => {
    const t = await client.query<{ id: string }>(
      `insert into tasks (workspace_id, template_slug, name, status, input, started_at)
         values ($1, $2, $3, 'running', $4, now())
       returning id`,
      [args.workspaceId, args.template.slug, args.taskName, JSON.stringify(args.input)],
    );
    const taskId = t.rows[0]!.id;

    for (let i = 0; i < args.template.phases.length; i++) {
      const p = args.template.phases[i]!;
      let workflowId: string | null = null;
      if (p.workflow_name) {
        const w = await client.query<{ id: string }>(
          `select id from workflows where workspace_id = $1 and name = $2 and archived = false`,
          [args.workspaceId, p.workflow_name],
        );
        if (!w.rows[0]) {
          throw new Error(`phase ${i} references missing workflow "${p.workflow_name}"`);
        }
        workflowId = w.rows[0].id;
      }

      const notBefore = p.not_before_hours != null
        ? new Date(Date.now() + p.not_before_hours * 3600 * 1000)
        : null;

      await client.query(
        `insert into task_phases (task_id, order_idx, name, workflow_id, human_gate, human_instructions,
                                  depends_on, not_before, input)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          taskId,
          i,
          p.name,
          workflowId,
          p.human_gate ?? false,
          p.human_instructions ?? null,
          JSON.stringify(p.depends_on),
          notBefore,
          JSON.stringify(p.input),
        ],
      );
    }

    return { task_id: taskId, phase_count: args.template.phases.length };
  });
}

// ===== Loaders for the orchestrator =====

export interface TaskRow {
  id: string;
  workspace_id: string;
  template_slug: string | null;
  name: string;
  status: string;
  state: Record<string, unknown>;
  input: Record<string, unknown>;
  result: unknown;
  error: string | null;
}

export interface TaskPhaseRow {
  id: string;
  task_id: string;
  order_idx: number;
  name: string;
  workflow_id: string | null;
  human_gate: boolean;
  human_instructions: string | null;
  depends_on: number[];
  not_before: Date | null;
  status: string;
  run_id: string | null;
  input: Record<string, unknown> | null;
  output: unknown;
  error: string | null;
}

export async function loadActiveTasks(): Promise<TaskRow[]> {
  const r = await query<TaskRow>(
    `select id, workspace_id, template_slug, name, status, state, input, result, error
       from tasks
      where status in ('pending','running','awaiting_human')`,
    [],
  );
  return r.rows;
}

export async function loadTaskPhases(taskId: string): Promise<TaskPhaseRow[]> {
  const r = await query<TaskPhaseRow>(
    `select id, task_id, order_idx, name, workflow_id, human_gate, human_instructions,
            depends_on, not_before, status, run_id, input, output, error
       from task_phases
      where task_id = $1
      order by order_idx asc`,
    [taskId],
  );
  return r.rows;
}

export async function loadTask(taskId: string, workspaceId: string): Promise<TaskRow | null> {
  const r = await query<TaskRow>(
    `select id, workspace_id, template_slug, name, status, state, input, result, error
       from tasks
      where id = $1 and workspace_id = $2`,
    [taskId, workspaceId],
  );
  return r.rows[0] ?? null;
}

// ===== Phase state transitions (used by orchestrator) =====

export async function markPhaseRunning(phaseId: string, runId: string): Promise<void> {
  await query(
    `update task_phases set status = 'running', run_id = $1, started_at = now() where id = $2`,
    [runId, phaseId],
  );
}

export async function markPhaseAwaitingHuman(phaseId: string): Promise<void> {
  await query(
    `update task_phases set status = 'awaiting_human', started_at = coalesce(started_at, now()) where id = $1`,
    [phaseId],
  );
}

export async function markPhaseSucceeded(phaseId: string, output: unknown): Promise<void> {
  await query(
    `update task_phases set status = 'succeeded', output = $1, finished_at = now() where id = $2`,
    [JSON.stringify(output), phaseId],
  );
}

export async function markPhaseFailed(phaseId: string, error: string): Promise<void> {
  await query(
    `update task_phases set status = 'failed', error = $1, finished_at = now() where id = $2`,
    [error, phaseId],
  );
}

export async function updateTaskStatus(
  taskId: string,
  patch: { status?: string; result?: unknown; error?: string | null; finished_at?: Date | null },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    sets.push(`${k} = $${i++}`);
    vals.push(k === "result" ? JSON.stringify(v) : v);
  }
  if (!sets.length) return;
  vals.push(taskId);
  await query(`update tasks set ${sets.join(", ")} where id = $${i}`, vals);
}
