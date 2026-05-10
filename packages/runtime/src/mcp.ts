import { query } from "./db.js";
import { log } from "./trace.js";
import type { ToolDefinition } from "./types.js";

interface McpServerRow {
  id: string;
  slug: string;
  display_name: string;
  transport: "stdio" | "http" | "sse";
  config: Record<string, unknown>;
  status: string;
}

/**
 * Load tools from a registered MCP server.
 * v0: stub. Wire @modelcontextprotocol/sdk Client here per transport and
 * surface its tools as ToolDefinitions. Each invoke() forwards to the MCP
 * server's tools/call endpoint and returns the textual content.
 */
export async function loadMcpTools(slug: string, workspaceId: string): Promise<ToolDefinition[]> {
  const r = await query<McpServerRow>(
    `select id, slug, display_name, transport, config, status
       from mcp_servers
      where slug = $1 and (workspace_id = $2 or workspace_id is null)
      order by workspace_id nulls last
      limit 1`,
    [slug, workspaceId],
  );
  const row = r.rows[0];
  if (!row) {
    log.warn({ slug, workspaceId }, "mcp server not found");
    return [];
  }
  log.info({ slug: row.slug, transport: row.transport }, "mcp loadMcpTools — TODO wire SDK client");
  return [];
}
