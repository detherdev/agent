import { query, log, nangoProxy, getConnection } from "runtime";
import { runsQueue } from "../queue.js";

interface DriveWorkflow {
  id: string;
  workspace_id: string;
  version: number;
  trigger_config: { folder_id?: string; mime_filter?: string };
  last_polled_at: Date | null;
}

interface DriveListResponse {
  files?: Array<{
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    size?: string;
  }>;
}

const FILE_MAX_BYTES = Number(process.env.DRIVE_FILE_MAX_BYTES ?? 20 * 1024 * 1024);

/**
 * Watch a Google Drive folder and fire a run per new file.
 *
 * Each run input mirrors the inbound_email shape — the file shows up as a
 * single attachment so the same `document_understand` tool works without
 * any changes. dedup_key = `drive:<file_id>` makes the trigger idempotent
 * across worker restarts.
 */
export async function driveTick(): Promise<void> {
  const now = new Date();
  const r = await query<DriveWorkflow>(
    `select id, workspace_id, version, trigger_config, last_polled_at
       from workflows
      where trigger_kind = 'drive_watch' and archived = false and is_paused = false`,
    [],
  );

  for (const w of r.rows) {
    try {
      await pollOne(w, now);
    } catch (err) {
      log.warn({ workflow: w.id, err: (err as Error).message }, "drive poll failed");
    }
  }
}

async function pollOne(w: DriveWorkflow, now: Date): Promise<void> {
  const conn = await getConnection(w.workspace_id, "google-drive");
  if (!conn) return;
  if (!w.trigger_config.folder_id) return;

  if (!w.last_polled_at) {
    await query(`update workflows set last_polled_at = $1 where id = $2`, [now, w.id]);
    return;
  }

  const parts = [`'${w.trigger_config.folder_id}' in parents`, "trashed = false"];
  parts.push(`modifiedTime > '${w.last_polled_at.toISOString()}'`);
  if (w.trigger_config.mime_filter) parts.push(`mimeType = '${w.trigger_config.mime_filter}'`);
  const q = parts.join(" and ");

  const list = await nangoProxy({
    workspaceId: w.workspace_id,
    provider: "google-drive",
    method: "GET",
    endpoint: "/drive/v3/files",
    query: {
      q,
      fields: "files(id,name,mimeType,modifiedTime,size)",
      pageSize: 25,
    },
  });
  if (!list.ok) {
    log.warn({ workflow: w.id, status: list.status }, "drive list failed");
    return;
  }

  const data = list.data as DriveListResponse;
  const files = data.files ?? [];

  for (const f of files) {
    if (Number(f.size ?? 0) > FILE_MAX_BYTES) {
      log.info({ workflow: w.id, file: f.id, size: f.size }, "drive file too large; skipping");
      continue;
    }
    const dedupKey = `drive:${f.id}`;

    const content = await nangoProxy({
      workspaceId: w.workspace_id,
      provider: "google-drive",
      method: "GET",
      endpoint: `/drive/v3/files/${encodeURIComponent(f.id)}`,
      query: { alt: "media" },
    });
    if (!content.ok) continue;
    const b64 = Buffer.from(content.raw, "binary").toString("base64");

    const runInput = {
      file_id: f.id,
      file_name: f.name,
      mime_type: f.mimeType,
      modified_time: f.modifiedTime,
      attachments: [
        {
          name: f.name,
          content_type: f.mimeType,
          content_base64: b64,
          size_bytes: Number(f.size ?? 0),
        },
      ],
      attachment_count: 1,
    };

    const ins = await query<{ id: string }>(
      `insert into runs (workflow_id, workspace_id, workflow_version, trigger_kind, input, dedup_key)
         values ($1,$2,$3,'drive_watch',$4,$5)
       on conflict (workflow_id, dedup_key) where dedup_key is not null
         do nothing
       returning id`,
      [w.id, w.workspace_id, w.version, JSON.stringify(runInput), dedupKey],
    );
    if (ins.rows.length === 0) continue;
    const runId = ins.rows[0]!.id;
    await runsQueue.add("run", { runId, workflowId: w.id });
    log.info({ workflow: w.id, run: runId, file: f.id }, "drive_watch fire");
  }

  await query(`update workflows set last_polled_at = $1 where id = $2`, [now, w.id]);
}
