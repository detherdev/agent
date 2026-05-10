import { query, withTx } from "./db.js";
import type { Run, RunStatus, TurnRecord } from "./types.js";

export async function loadRun(runId: string): Promise<Run | null> {
  const r = await query<Run>(`select * from runs where id = $1`, [runId]);
  return r.rows[0] ?? null;
}

export async function loadTurns(runId: string): Promise<TurnRecord[]> {
  const r = await query<TurnRecord & { step: number }>(
    `select step, role, content, tool_name, tool_input, tool_result,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            cost_usd, duration_ms
       from turns
      where run_id = $1
      order by step asc`,
    [runId],
  );
  return r.rows;
}

export async function appendTurn(runId: string, turn: TurnRecord): Promise<void> {
  await query(
    `insert into turns (run_id, step, role, content, tool_name, tool_input, tool_result,
                        input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                        cost_usd, duration_ms)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      runId,
      turn.step,
      turn.role,
      JSON.stringify(turn.content),
      turn.tool_name ?? null,
      turn.tool_input ? JSON.stringify(turn.tool_input) : null,
      turn.tool_result ? JSON.stringify(turn.tool_result) : null,
      turn.input_tokens ?? null,
      turn.output_tokens ?? null,
      turn.cache_read_tokens ?? null,
      turn.cache_write_tokens ?? null,
      turn.cost_usd ?? null,
      turn.duration_ms ?? null,
    ],
  );
}

export async function updateRunStatus(
  runId: string,
  patch: Partial<Pick<Run, "status" | "result" | "error" | "cost_usd" | "step_count" | "started_at" | "finished_at">>,
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    sets.push(`${k} = $${i++}`);
    vals.push(k === "result" ? JSON.stringify(v) : v);
  }
  if (!sets.length) return;
  vals.push(runId);
  await query(`update runs set ${sets.join(", ")} where id = $${i}`, vals);
}

export async function createApproval(args: {
  runId: string;
  workspaceId: string;
  step: number;
  reason: string;
  toolName: string;
  toolInput: unknown;
}): Promise<string> {
  return await withTx(async (client) => {
    const r = await client.query<{ id: string }>(
      `insert into approvals (run_id, workspace_id, step, reason, pending_tool_name, pending_tool_input)
       values ($1,$2,$3,$4,$5,$6)
       returning id`,
      [
        args.runId,
        args.workspaceId,
        args.step,
        args.reason,
        args.toolName,
        JSON.stringify(args.toolInput),
      ],
    );
    await client.query(`update runs set status = 'awaiting_approval' where id = $1`, [args.runId]);
    return r.rows[0]!.id;
  });
}

export async function loadPendingApproval(runId: string): Promise<{
  id: string;
  step: number;
  pending_tool_name: string;
  pending_tool_input: unknown;
  status: string;
  edited_input: unknown;
} | null> {
  const r = await query<{
    id: string;
    step: number;
    pending_tool_name: string;
    pending_tool_input: unknown;
    status: string;
    edited_input: unknown;
  }>(
    `select id, step, pending_tool_name, pending_tool_input, status, edited_input
       from approvals
      where run_id = $1
      order by created_at desc
      limit 1`,
    [runId],
  );
  return r.rows[0] ?? null;
}
