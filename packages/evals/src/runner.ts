import {
  query,
  runAgent,
  Workflow,
  Guardrails,
  ToolConfig,
  loadRun,
  log,
} from "runtime";
import { judge } from "./judge.js";
import crypto from "node:crypto";

export interface TestCaseResult {
  test_case_id: string;
  name: string;
  passed: boolean;
  reasoning: string;
  score: number;
  cost_usd: number;
}

export async function runTestPack(workflowId: string): Promise<TestCaseResult[]> {
  const wfRow = await query(`select * from workflows where id = $1`, [workflowId]);
  const w = wfRow.rows[0];
  if (!w) throw new Error("workflow not found");

  const workflow: Workflow = {
    id: w.id,
    workspace_id: w.workspace_id,
    name: w.name,
    goal: w.goal,
    input_schema: w.input_schema,
    trigger_kind: w.trigger_kind,
    trigger_config: w.trigger_config,
    tool_config: ToolConfig.parse(w.tool_config ?? {}),
    guardrails: Guardrails.parse({ ...w.guardrails, shadow_mode: true }),
    model: w.model,
    planner_model: w.planner_model,
    version: w.version,
  };

  const cases = await query<{ id: string; name: string; input: unknown; rubric: string }>(
    `select id, name, input, rubric from test_cases where workflow_id = $1 order by created_at`,
    [workflowId],
  );

  const results: TestCaseResult[] = [];

  for (const tc of cases.rows) {
    const runId = crypto.randomUUID();
    await query(
      `insert into runs (id, workflow_id, workspace_id, workflow_version, trigger_kind, input, shadow_mode)
       values ($1,$2,$3,$4,'manual',$5,true)`,
      [runId, workflow.id, workflow.workspace_id, workflow.version, JSON.stringify(tc.input)],
    );

    const run = await runAgent({ workflow, runId, input: tc.input, shadowMode: true });

    const verdict =
      run.status === "succeeded"
        ? await judge({ input: tc.input, rubric: tc.rubric, output: run.result })
        : { passed: false, reasoning: `run did not succeed: ${run.status} ${run.error ?? ""}`, score: 0 };

    await query(
      `insert into test_runs (workflow_id, workflow_version, test_case_id, run_id, passed, judge_verdict)
       values ($1,$2,$3,$4,$5,$6)`,
      [workflow.id, workflow.version, tc.id, runId, verdict.passed, JSON.stringify(verdict)],
    );

    results.push({
      test_case_id: tc.id,
      name: tc.name,
      passed: verdict.passed,
      reasoning: verdict.reasoning,
      score: verdict.score,
      cost_usd: run.cost_usd,
    });

    log.info(
      { test_case: tc.name, passed: verdict.passed, score: verdict.score, cost: run.cost_usd },
      "test case complete",
    );
  }

  return results;
}
