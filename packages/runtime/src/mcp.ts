import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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

interface HttpConfig {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Connect to a registered MCP server, list its tools, and surface each as
 * a ToolDefinition the agent loop can invoke. v0 supports the HTTP
 * transport only; stdio and SSE are passthrough TODOs.
 *
 * One client per call: spin up, list tools, return adapters that close
 * over a fresh client per invoke. (For high-volume use, lift to a
 * connection pool keyed on workspace+slug.)
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
    log.warn({ slug, workspaceId }, "mcp server not found in registry");
    return [];
  }
  if (row.transport !== "http") {
    log.warn({ slug, transport: row.transport }, "mcp transport not yet implemented; skipping");
    return [];
  }

  const cfg = row.config as unknown as HttpConfig;
  if (!cfg.url) {
    log.warn({ slug }, "mcp server config missing url");
    return [];
  }

  let client: Client;
  let toolList: Awaited<ReturnType<Client["listTools"]>>;
  try {
    client = await openClient(cfg);
    toolList = await client.listTools();
  } catch (err) {
    log.warn({ slug, err: (err as Error).message }, "mcp listTools failed");
    return [];
  } finally {
    // We close the discovery client; per-invoke clients are opened lazily
    // below so each tool call is independent.
  }

  await safeClose(client);

  return toolList.tools.map((t) => ({
    name: `mcp__${row.slug}__${t.name}`,
    description: t.description ?? `(${row.display_name}) ${t.name}`,
    input_schema: (t.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
    invoke: async (input) => {
      let invokeClient: Client | null = null;
      try {
        invokeClient = await openClient(cfg);
        const res = await invokeClient.callTool({ name: t.name, arguments: input as Record<string, unknown> });
        const content = (res.content ?? []) as Array<{ type: string; text?: string }>;
        const text = content
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("\n");
        return {
          content: text || JSON.stringify(res.content ?? {}),
          is_error: res.isError === true,
        };
      } catch (err) {
        return { content: `MCP call failed: ${(err as Error).message}`, is_error: true };
      } finally {
        if (invokeClient) await safeClose(invokeClient);
      }
    },
  }));
}

async function openClient(cfg: HttpConfig): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
    requestInit: { headers: cfg.headers ?? {} },
  });
  const client = new Client(
    { name: "agent-workflow-runtime", version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}

async function safeClose(client: Client): Promise<void> {
  try {
    await client.close();
  } catch (err) {
    log.warn({ err: (err as Error).message }, "mcp client close failed");
  }
}
