import type { ToolDefinition } from "../types.js";
import { nangoProxy, summarize } from "./nango.js";

/**
 * Google Drive — list files in a folder + fetch one file's content as base64.
 * The drive_watch trigger uses the same `nangoProxy` calls under the hood
 * to poll a folder for new files; this is the in-agent surface.
 */
export function driveTools(): ToolDefinition[] {
  return [
    {
      name: "drive_list_files",
      description:
        "List files in a Google Drive folder (paged). Returns id, name, mimeType, modifiedTime " +
        "for up to 50 files matching the query.",
      input_schema: {
        type: "object",
        properties: {
          folder_id: { type: "string", description: "Drive folder id" },
          modified_after: {
            type: "string",
            description: "ISO timestamp; only return files modified after this",
          },
          query: {
            type: "string",
            description: "Optional Drive query language fragment, ANDed with the folder filter",
          },
        },
        required: ["folder_id"],
      },
      invoke: async (input, ctx) => {
        const { folder_id, modified_after, query } = input as {
          folder_id: string;
          modified_after?: string;
          query?: string;
        };
        const parts = [`'${folder_id}' in parents`, "trashed = false"];
        if (modified_after) parts.push(`modifiedTime > '${modified_after}'`);
        if (query) parts.push(query);
        const q = parts.join(" and ");

        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "google-drive",
          method: "GET",
          endpoint: "/drive/v3/files",
          query: {
            q,
            fields: "files(id,name,mimeType,modifiedTime,size)",
            pageSize: 50,
          },
        });
        return { content: summarize(res, "drive_list_files"), is_error: !res.ok };
      },
    },
    {
      name: "drive_get_file",
      description:
        "Fetch a Drive file's metadata + content. Returns binary as base64 in the result. " +
        "Pair with document_understand to extract structured data from PDFs/images.",
      input_schema: {
        type: "object",
        properties: { file_id: { type: "string" } },
        required: ["file_id"],
      },
      invoke: async (input, ctx) => {
        const { file_id } = input as { file_id: string };
        const meta = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "google-drive",
          method: "GET",
          endpoint: `/drive/v3/files/${encodeURIComponent(file_id)}`,
          query: { fields: "id,name,mimeType,size" },
        });
        if (!meta.ok) return { content: summarize(meta, "drive_get_file (meta)"), is_error: true };

        const content = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "google-drive",
          method: "GET",
          endpoint: `/drive/v3/files/${encodeURIComponent(file_id)}`,
          query: { alt: "media" },
        });
        if (!content.ok) return { content: summarize(content, "drive_get_file (content)"), is_error: true };

        const b64 = Buffer.from(content.raw, "binary").toString("base64");
        return {
          content: `file: ${JSON.stringify(meta.data)}\ncontent_base64: ${b64.slice(0, 200)}…[${b64.length} bytes total]`,
          meta: { full_content_base64: b64 },
        };
      },
    },
  ];
}
