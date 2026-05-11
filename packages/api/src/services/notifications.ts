/**
 * Approval notifications fan-out.
 *
 * Today: Slack, no-op if the workspace hasn't installed the bot.
 * Tomorrow: Teams, email digest, etc. Each surface is best-effort — a
 * notification failure must never roll back the underlying state change
 * (the approval row has already been written).
 *
 * All fan-out is fire-and-forget from the caller's perspective; we catch
 * everything internally and log on failure.
 */

import { query, log } from "runtime";
import {
  loadInstallationByWorkspace as loadSlackInstallation,
  postApprovalCard as postSlackApprovalCard,
  updateApprovalCard as updateSlackApprovalCard,
  describeApproval as describeApprovalSlack,
} from "./slack-bot.js";
import {
  loadInstallationByWorkspace as loadTeamsInstallation,
  postApprovalCard as postTeamsApprovalCard,
  updateApprovalCard as updateTeamsApprovalCard,
} from "./teams-bot.js";

interface ApprovalRow {
  id: string;
  workspace_id: string;
  pending_tool_name: string;
  pending_tool_input: Record<string, unknown>;
  reason: string;
  task_phase_id: string | null;
  run_id: string | null;
  slack_channel_id: string | null;
  slack_message_ts: string | null;
  teams_conversation_id: string | null;
  teams_activity_id: string | null;
}

/**
 * Called immediately after createApproval / beginHumanGate. Posts the card
 * to Slack if installed and stashes channel/ts back on the approval row so
 * we can update the same message later.
 */
export async function notifyApprovalPending(approvalId: string): Promise<void> {
  const approval = await loadApproval(approvalId);
  if (!approval) {
    log.warn({ approvalId }, "notifyApprovalPending: approval not found");
    return;
  }

  await Promise.all([
    postToSlack(approval).catch((err) =>
      log.error(
        { err: (err as Error).message, approvalId, workspace: approval.workspace_id },
        "notifyApprovalPending: slack post failed",
      ),
    ),
    postToTeams(approval).catch((err) =>
      log.error(
        { err: (err as Error).message, approvalId, workspace: approval.workspace_id },
        "notifyApprovalPending: teams post failed",
      ),
    ),
  ]);
}

/**
 * Called from /v1/approvals/:id/decide after a web-side decision so the
 * Slack card visually catches up. Slack-side decisions update the card
 * inline in the interaction handler — no need to re-call this.
 */
export async function notifyApprovalDecided(
  approvalId: string,
  decision: "approved" | "rejected" | "edited",
  decidedBy: string | undefined,
): Promise<void> {
  const approval = await loadApproval(approvalId);
  if (!approval) return;

  const title = describeApprovalSlack(approval.pending_tool_name, approval.pending_tool_input ?? {});

  const slackUpdate = approval.slack_channel_id && approval.slack_message_ts
    ? loadSlackInstallation(approval.workspace_id).then((install) =>
        install
          ? updateSlackApprovalCard({
              install,
              channel: approval.slack_channel_id!,
              ts: approval.slack_message_ts!,
              title,
              decision,
              decidedBy,
            })
          : null,
      )
    : Promise.resolve(null);

  const teamsUpdate = approval.teams_conversation_id && approval.teams_activity_id
    ? loadTeamsInstallation(approval.workspace_id).then((install) =>
        install
          ? updateTeamsApprovalCard({
              install,
              conversationId: approval.teams_conversation_id!,
              activityId: approval.teams_activity_id!,
              title,
              decision,
              decidedBy,
            })
          : null,
      )
    : Promise.resolve(null);

  await Promise.all([
    slackUpdate.catch((err) =>
      log.warn({ err: (err as Error).message, approvalId }, "notifyApprovalDecided: slack update failed"),
    ),
    teamsUpdate.catch((err) =>
      log.warn({ err: (err as Error).message, approvalId }, "notifyApprovalDecided: teams update failed"),
    ),
  ]);
}

async function postToSlack(approval: ApprovalRow): Promise<void> {
  const install = await loadSlackInstallation(approval.workspace_id);
  if (!install) return; // workspace hasn't connected Slack yet

  const title = describeApprovalSlack(approval.pending_tool_name, approval.pending_tool_input ?? {});
  const taskOrWorkflowName = await loadParentName(approval);

  const res = await postSlackApprovalCard({
    install,
    approvalId: approval.id,
    title,
    reason: approval.reason,
    taskOrWorkflowName,
  });
  if (!res.ok || !res.channel || !res.ts) {
    log.warn({ approvalId: approval.id, err: res.error }, "slack post returned not-ok");
    return;
  }

  await query(
    `update approvals set slack_channel_id = $1, slack_message_ts = $2 where id = $3`,
    [res.channel, res.ts, approval.id],
  );
}

async function postToTeams(approval: ApprovalRow): Promise<void> {
  const install = await loadTeamsInstallation(approval.workspace_id);
  if (!install || install.status !== "active") return; // workspace hasn't completed Teams install

  const title = describeApprovalSlack(approval.pending_tool_name, approval.pending_tool_input ?? {});
  const taskOrWorkflowName = await loadParentName(approval);

  const res = await postTeamsApprovalCard({
    install,
    approvalId: approval.id,
    title,
    reason: approval.reason,
    taskOrWorkflowName,
  });
  if (!res.ok || !res.activity_id) {
    log.warn({ approvalId: approval.id, err: res.error }, "teams post returned not-ok");
    return;
  }

  await query(
    `update approvals set teams_conversation_id = $1, teams_activity_id = $2 where id = $3`,
    [install.conversation_id, res.activity_id, approval.id],
  );
}

async function loadApproval(approvalId: string): Promise<ApprovalRow | null> {
  const r = await query<ApprovalRow>(
    `select id, workspace_id, pending_tool_name, pending_tool_input,
            reason, task_phase_id, run_id, slack_channel_id, slack_message_ts,
            teams_conversation_id, teams_activity_id
       from approvals where id = $1`,
    [approvalId],
  );
  return r.rows[0] ?? null;
}

async function loadParentName(approval: ApprovalRow): Promise<string | undefined> {
  if (approval.task_phase_id) {
    const r = await query<{ task_name: string; phase_name: string }>(
      `select t.name as task_name, tp.name as phase_name
         from task_phases tp
         join tasks t on t.id = tp.task_id
        where tp.id = $1`,
      [approval.task_phase_id],
    );
    const row = r.rows[0];
    return row ? `${row.task_name} → ${row.phase_name}` : undefined;
  }
  if (approval.run_id) {
    const r = await query<{ name: string }>(
      `select w.name from runs r join workflows w on w.id = r.workflow_id where r.id = $1`,
      [approval.run_id],
    );
    return r.rows[0]?.name;
  }
  return undefined;
}
