import type { CustomTool, ToolConfig, ToolDefinition } from "../types.js";
import { makeHttpTool } from "./http.js";
import { makeSqlTool } from "./sql.js";
import { loadMcpTools } from "../mcp.js";

export { makeHttpTool, makeSqlTool };

export async function buildToolset(config: ToolConfig, workspaceId: string): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [];

  for (const t of config.custom_tools) {
    tools.push(buildCustomTool(t));
  }

  for (const ref of config.mcp_servers) {
    const mcpTools = await loadMcpTools(ref.slug, workspaceId);
    tools.push(...mcpTools);
  }

  return tools;
}

function buildCustomTool(t: CustomTool): ToolDefinition {
  if (t.kind === "http") {
    const cfg = t.config as { base_url: string; headers?: Record<string, string> };
    return makeHttpTool({
      name: t.name,
      description: t.description,
      base_url: cfg.base_url,
      headers: cfg.headers,
    });
  }
  if (t.kind === "sql") {
    const cfg = t.config as { connection_string: string; read_only?: boolean };
    return makeSqlTool({
      name: t.name,
      description: t.description,
      connection_string: cfg.connection_string,
      read_only: cfg.read_only,
    });
  }
  throw new Error(`Unknown custom tool kind: ${t.kind as string}`);
}
