import pg from "pg";
import type { ToolDefinition } from "../types.js";

const { Pool } = pg;

const FORBIDDEN = /\b(drop|truncate|alter|grant|revoke|create\s+role|create\s+user)\b/i;

export function makeSqlTool(args: {
  name: string;
  description: string;
  connection_string: string;
  read_only?: boolean;
}): ToolDefinition {
  const pool = new Pool({ connectionString: args.connection_string, max: 5 });
  const readOnly = args.read_only ?? true;

  return {
    name: args.name,
    description: args.description,
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string" },
        params: { type: "array", items: {} },
      },
      required: ["sql"],
    },
    invoke: async (input, ctx) => {
      const { sql, params } = input as { sql: string; params?: unknown[] };

      if (FORBIDDEN.test(sql)) {
        return { content: "Refused: DDL/permission statements are forbidden.", is_error: true };
      }

      if (readOnly && !/^\s*(select|with)\b/i.test(sql)) {
        return { content: "Refused: this connection is read-only.", is_error: true };
      }

      if (ctx.shadow_mode && !/^\s*(select|with)\b/i.test(sql)) {
        return { content: `[shadow_mode] would have run: ${sql.slice(0, 200)}`, meta: { shadow: true } };
      }

      try {
        const r = await pool.query(sql, (params as never[] | undefined) ?? []);
        const rows = r.rows.slice(0, 200);
        return {
          content: `rows=${r.rows.length} (showing ${rows.length})\n${JSON.stringify(rows)}`,
        };
      } catch (err) {
        return { content: `SQL error: ${(err as Error).message}`, is_error: true };
      }
    },
  };
}
