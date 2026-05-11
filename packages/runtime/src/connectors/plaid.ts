/**
 * Plaid — bank account read tools.
 *
 * Plaid OAuth runs through Nango with provider_config_key = "plaid". The
 * `item_id` and `access_token` live in Nango's connection store; we never
 * see the access_token directly. nangoProxy injects it into the
 * Plaid-Access-Token header on every call.
 *
 * Tools are read-only — Plaid does support payment initiation but that's
 * out of scope for the bookkeeping wedge (matching Plaid txns to QB).
 */

import type { ToolDefinition } from "../types.js";
import { nangoProxy, summarize } from "./nango.js";

const PLAID_BASE = ""; // Nango proxies to Plaid root; endpoints are full Plaid paths.

export function plaidTools(): ToolDefinition[] {
  return [
    {
      name: "plaid_list_accounts",
      description:
        "List bank accounts the customer has linked through Plaid. Returns one row per account with name, type, mask (last 4), current/available balance.",
      input_schema: { type: "object", properties: {} },
      invoke: async (_input, ctx) => {
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "plaid",
          method: "POST",
          endpoint: `${PLAID_BASE}/accounts/get`,
          data: {},
        });
        return { content: summarize(res, "plaid_list_accounts"), is_error: !res.ok };
      },
    },
    {
      name: "plaid_list_transactions",
      description:
        "Fetch transactions for a Plaid-linked account in a date range. Use ISO YYYY-MM-DD. Returns date, amount, merchant, category, pending status. Maximum 500 per call — paginate via offset if needed.",
      input_schema: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "ISO YYYY-MM-DD inclusive" },
          end_date: { type: "string", description: "ISO YYYY-MM-DD inclusive" },
          account_ids: {
            type: "array",
            items: { type: "string" },
            description: "Optional — restrict to specific Plaid account_ids",
          },
          count: { type: "integer", default: 100, maximum: 500 },
          offset: { type: "integer", default: 0 },
        },
        required: ["start_date", "end_date"],
      },
      invoke: async (input, ctx) => {
        const v = input as {
          start_date: string;
          end_date: string;
          account_ids?: string[];
          count?: number;
          offset?: number;
        };
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "plaid",
          method: "POST",
          endpoint: `${PLAID_BASE}/transactions/get`,
          data: {
            start_date: v.start_date,
            end_date: v.end_date,
            options: {
              count: Math.min(v.count ?? 100, 500),
              offset: v.offset ?? 0,
              ...(v.account_ids ? { account_ids: v.account_ids } : {}),
            },
          },
        });
        return { content: summarize(res, "plaid_list_transactions"), is_error: !res.ok };
      },
    },
    {
      name: "plaid_get_balance",
      description:
        "Real-time balance refresh for one or more Plaid accounts. Use sparingly — Plaid bills per call. Defaults to all accounts if account_ids omitted.",
      input_schema: {
        type: "object",
        properties: {
          account_ids: { type: "array", items: { type: "string" } },
        },
      },
      invoke: async (input, ctx) => {
        const v = input as { account_ids?: string[] };
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "plaid",
          method: "POST",
          endpoint: `${PLAID_BASE}/accounts/balance/get`,
          data: v.account_ids ? { options: { account_ids: v.account_ids } } : {},
        });
        return { content: summarize(res, "plaid_get_balance"), is_error: !res.ok };
      },
    },
    {
      name: "plaid_get_item",
      description:
        "Return the Plaid Item (institution metadata + connection health). Useful for surfacing bank name and link freshness.",
      input_schema: { type: "object", properties: {} },
      invoke: async (_input, ctx) => {
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "plaid",
          method: "POST",
          endpoint: `${PLAID_BASE}/item/get`,
          data: {},
        });
        return { content: summarize(res, "plaid_get_item"), is_error: !res.ok };
      },
    },
  ];
}
