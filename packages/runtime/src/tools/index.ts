import type {
  CustomTool,
  ToolConfig,
  ToolDefinition,
  BuiltinToolName,
  Workflow,
} from "../types.js";
import { makeHttpTool } from "./http.js";
import { makeSqlTool } from "./sql.js";
import { documentUnderstandTool } from "./document_understand.js";
import { browserUseTool } from "./browser_use.js";
import { makeDelegateTools } from "./delegate.js";
import { loadMcpTools } from "../mcp.js";
import { loadConnectorTools } from "../connectors/index.js";

export { makeHttpTool, makeSqlTool, documentUnderstandTool, browserUseTool, makeDelegateTools };

// Stateless built-ins. Tools that need workflow context (delegate_*) are
// constructed in buildToolset via the workflow argument instead.
const BUILTINS: Partial<Record<BuiltinToolName, () => ToolDefinition>> = {
  document_understand: documentUnderstandTool,
  browser_use: browserUseTool,
};

export async function buildToolset(
  config: ToolConfig,
  workspaceId: string,
  workflow?: Workflow,
): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [];

  for (const ref of config.connectors) {
    tools.push(...loadConnectorTools(ref.slug));
  }

  const wantsDelegate =
    workflow != null &&
    config.builtins.some((b) => b === "delegate_subagent" || b === "delegate_parallel");
  if (wantsDelegate) {
    const delegateTools = makeDelegateTools(workflow);
    const wantedNames = new Set(config.builtins as string[]);
    tools.push(...delegateTools.filter((t) => wantedNames.has(t.name)));
  }

  for (const name of config.builtins) {
    const factory = BUILTINS[name];
    if (factory) tools.push(factory());
  }

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
