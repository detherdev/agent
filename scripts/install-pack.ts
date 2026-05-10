#!/usr/bin/env tsx
/**
 * Install a vertical pack (every *.json workflow file) into a workspace.
 *
 * Usage:
 *   tsx scripts/install-pack.ts <workspace_id> <pack_dir>
 *
 * Example:
 *   tsx scripts/install-pack.ts 11111111-1111-1111-1111-111111111111 packs/bookkeeping
 *
 * Each workflow JSON gets:
 *   - one row in `workflows` (with system_prompt loaded from system_prompt_path)
 *   - N rows in `test_cases`, one per `test_cases[]` entry
 */

import { readFile, readdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { query, withTx, Guardrails, ToolConfig, TriggerKind } from "runtime";

interface PackWorkflowJson {
  name: string;
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

async function main(): Promise<void> {
  const [workspaceId, packDir] = process.argv.slice(2);
  if (!workspaceId || !packDir) {
    console.error("usage: tsx scripts/install-pack.ts <workspace_id> <pack_dir>");
    process.exit(1);
  }

  const absPack = resolve(packDir);
  const files = (await readdir(absPack)).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error(`no *.json workflows found in ${absPack}`);
    process.exit(1);
  }

  await ensureWorkspace(workspaceId);

  for (const file of files) {
    const path = join(absPack, file);
    const json = JSON.parse(await readFile(path, "utf8")) as PackWorkflowJson;
    const systemPrompt = await readFile(join(dirname(path), json.system_prompt_path), "utf8");

    const triggerKind = TriggerKind.parse(json.trigger_kind);
    const toolConfig = ToolConfig.parse(json.tool_config);
    const guardrails = Guardrails.parse(json.guardrails);

    const workflowId = await withTx(async (client) => {
      const r = await client.query<{ id: string }>(
        `insert into workflows (workspace_id, name, goal, input_schema, trigger_kind,
                                trigger_config, tool_config, guardrails, model, planner_model)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning id`,
        [
          workspaceId,
          json.name,
          systemPrompt,
          JSON.stringify(json.input_schema ?? {}),
          triggerKind,
          JSON.stringify(json.trigger_config ?? {}),
          JSON.stringify(toolConfig),
          JSON.stringify(guardrails),
          json.model,
          json.planner_model ?? null,
        ],
      );
      const wfId = r.rows[0]!.id;

      for (const tc of json.test_cases ?? []) {
        await client.query(
          `insert into test_cases (workflow_id, name, input, rubric) values ($1,$2,$3,$4)`,
          [wfId, tc.name, JSON.stringify(tc.input), tc.rubric],
        );
      }

      return wfId;
    });

    console.log(`installed ${json.name}  →  ${workflowId}  (${json.test_cases?.length ?? 0} test cases)`);
  }
}

async function ensureWorkspace(id: string): Promise<void> {
  const r = await query(`select 1 from workspaces where id = $1`, [id]);
  if (r.rows.length === 0) {
    throw new Error(
      `workspace ${id} not found. Create it first:\n  insert into workspaces (id, name) values ('${id}', 'demo');`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
