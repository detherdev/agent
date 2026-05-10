import { Worker } from "bullmq";
import { connection, type RunJob } from "./queue.js";
import {
  query,
  runAgent,
  resumeAfterApproval,
  Workflow,
  Guardrails,
  ToolConfig,
  log,
} from "runtime";

const worker = new Worker<RunJob>(
  "runs",
  async (job) => {
    const { runId, resume } = job.data;

    const r = await query(
      `select w.* from runs r join workflows w on w.id = r.workflow_id where r.id = $1`,
      [runId],
    );
    const row = r.rows[0];
    if (!row) throw new Error(`workflow not found for run ${runId}`);

    const workflow: Workflow = {
      id: row.id,
      workspace_id: row.workspace_id,
      name: row.name,
      goal: row.goal,
      input_schema: row.input_schema,
      trigger_kind: row.trigger_kind,
      trigger_config: row.trigger_config,
      tool_config: ToolConfig.parse(row.tool_config ?? {}),
      guardrails: Guardrails.parse(row.guardrails ?? {}),
      model: row.model,
      planner_model: row.planner_model,
      version: row.version,
    };

    const runRow = await query<{ input: unknown; shadow_mode: boolean }>(
      `select input, shadow_mode from runs where id = $1`,
      [runId],
    );
    const input = runRow.rows[0]!.input;
    const shadowMode = runRow.rows[0]!.shadow_mode;

    if (resume) return await resumeAfterApproval(runId, workflow);
    return await runAgent({ workflow, runId, input, shadowMode });
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4) },
);

worker.on("failed", (job, err) => {
  log.error({ jobId: job?.id, err: err.message }, "run job failed");
});

worker.on("completed", (job, result) => {
  log.info({ jobId: job.id, result }, "run job completed");
});

console.log("worker listening on queue: runs");
