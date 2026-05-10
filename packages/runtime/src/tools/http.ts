import type { ToolDefinition } from "../types.js";

export function makeHttpTool(args: {
  name: string;
  description: string;
  base_url: string;
  headers?: Record<string, string>;
}): ToolDefinition {
  return {
    name: args.name,
    description: args.description,
    input_schema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] },
        path: { type: "string" },
        query: { type: "object" },
        body: {},
      },
      required: ["method", "path"],
    },
    invoke: async (input, ctx) => {
      const { method, path, query, body } = input as {
        method: string;
        path: string;
        query?: Record<string, string>;
        body?: unknown;
      };

      if (ctx.shadow_mode && method !== "GET") {
        return {
          content: `[shadow_mode] would have called ${method} ${path}`,
          meta: { shadow: true },
        };
      }

      const url = new URL(path, args.base_url);
      if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));

      const res = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          ...(args.headers ?? {}),
        },
        body: body == null ? undefined : JSON.stringify(body),
      });

      const text = await res.text();
      return {
        content: `HTTP ${res.status}\n${text.slice(0, 50_000)}`,
        is_error: !res.ok,
        meta: { status: res.status },
      };
    },
  };
}
