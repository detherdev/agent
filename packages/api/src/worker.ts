import { Worker } from "bullmq";
import { connection, type RunJob } from "./queue.js";
import {
  query,
  runAgent,
  resumeAfterApproval,
  resumeAfterCrash,
  Workflow,
  Guardrails,
  ToolConfig,
  log,
} from "runtime";

const worker = new Worker<RunJob>(
  "runs",
  async (job) => {
    const { runId, resume } = job.data;

    const r = await query<{
      run_id: string;
      run_status: string;
      input: unknown;
      shadow_mode: boolean;
      id: string;
      workspace_id: string;
      name: string;
      goal: string;
      input_schema: Record<string, unknown>;
      trigger_kind: Workflow["trigger_kind"];
      trigger_config: Record<string, unknown>;
      tool_config: unknown;
      guardrails: unknown;
      model: string;
      planner_model: string | null;
      version: number;
      turn_count: string;
    }>(
      `select r.id as run_id,
              r.status as run_status,
              r.input as input,
              r.shadow_mode as shadow_mode,
              w.id, w.workspace_id, w.name, w.goal, w.input_schema,
              w.trigger_kind, w.trigger_config, w.tool_config, w.guardrails,
              w.model, w.planner_model, w.version,
              (select count(*) from turns t where t.run_id = r.id) as turn_count
         from runs r
         join workflows w on w.id = r.workflow_id
        where r.id = $1`,
      [runId],
    );
    const row = r.rows[0];
    if (!row) throw new Error(`run not found: ${runId}`);

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

    const turnCount = Number(row.turn_count);

    // Branch on state:
    //   resume=true        → user approved a paused tool call
    //   has turns, !resume → reaper re-enqueued a crash-stranded run
    //   no turns           → fresh run
    if (resume) {
      log.info({ runId, mode: "approval-resume" }, "worker handling job");
      return await resumeAfterApproval(runId, workflow);
    }
    if (turnCount > 0) {
      log.info({ runId, mode: "crash-resume", turns: turnCount }, "worker handling job");
      return await resumeAfterCrash(runId, workflow);
    }
    log.info({ runId, mode: "fresh" }, "worker handling job");
    return await runAgent({
      workflow,
      runId,
      input: row.input,
      shadowMode: row.shadow_mode,
    });
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
