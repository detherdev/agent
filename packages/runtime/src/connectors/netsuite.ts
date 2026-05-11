/**
 * NetSuite — SuiteTalk REST tools (SuiteQL queries + record CRUD).
 *
 * NetSuite OAuth2 runs through Nango with provider_config_key = "netsuite".
 * The account_id (NetSuite uses it as the subdomain — e.g. 1234567 →
 * 1234567.suitetalk.api.netsuite.com) is required for every URL; we read it
 * from connection metadata, populated by extractProviderMetadata.
 *
 * The proxy URL pattern is:
 *   https://<account>.suitetalk.api.netsuite.com/services/rest/...
 *
 * Nango's NetSuite integration handles the per-account base URL. We pass the
 * path after `/services/rest`.
 *
 * Tools cover the 80% of bookkeeping + manufacturer needs:
 *   - SuiteQL: arbitrary read against any record (the killer feature)
 *   - Item / Inventory item: lookup + on-hand
 *   - Sales Order: create, get
 *   - Customer: lookup
 */

import type { ToolDefinition } from "../types.js";
import { nangoProxy, summarize, getConnection } from "./nango.js";

interface NetsuiteMeta {
  account_id?: string;
}

async function ensureConnected(workspaceId: string): Promise<void> {
  const conn = await getConnection(workspaceId, "netsuite");
  if (!conn) throw new Error("netsuite not connected");
  const meta = (conn as unknown as { metadata?: NetsuiteMeta }).metadata ?? {};
  if (!meta.account_id) throw new Error("netsuite connection has no account_id in metadata");
}

export function netsuiteTools(): ToolDefinition[] {
  return [
    {
      name: "netsuite_suiteql",
      description:
        "Run a read-only SuiteQL query against the NetSuite account. SuiteQL is SQL-like over NetSuite records (e.g. select id, itemid, displayname from item where displayname like '%widget%'). Returns rows; cap with `limit` clause.",
      input_schema: {
        type: "object",
        properties: {
          q: { type: "string", description: "SuiteQL statement. Read-only." },
          limit: { type: "integer", default: 100, maximum: 1000 },
        },
        required: ["q"],
      },
      invoke: async (input, ctx) => {
        const v = input as { q: string; limit?: number };
        await ensureConnected(ctx.workspace_id);
        if (/^\s*(insert|update|delete|drop)\b/i.test(v.q)) {
          return {
            content: "SuiteQL: only SELECT allowed; use a record-write tool instead.",
            is_error: true,
          };
        }
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "netsuite",
          method: "POST",
          endpoint: `/services/rest/query/v1/suiteql?limit=${Math.min(v.limit ?? 100, 1000)}`,
          headers: { Prefer: "transient" },
          data: { q: v.q },
        });
        return { content: summarize(res, "netsuite_suiteql"), is_error: !res.ok };
      },
    },
    {
      name: "netsuite_get_item",
      description: "Fetch a NetSuite item (inventory or non-inventory) by internal id. Returns name, sku, on-hand, cost.",
      input_schema: {
        type: "object",
        properties: { item_id: { type: "string", description: "NetSuite internal id" } },
        required: ["item_id"],
      },
      invoke: async (input, ctx) => {
        const v = input as { item_id: string };
        await ensureConnected(ctx.workspace_id);
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "netsuite",
          method: "GET",
          endpoint: `/services/rest/record/v1/inventoryItem/${encodeURIComponent(v.item_id)}`,
        });
        return { content: summarize(res, "netsuite_get_item"), is_error: !res.ok };
      },
    },
    {
      name: "netsuite_inventory_on_hand",
      description:
        "Inventory on-hand by SKU — convenience over SuiteQL. Returns quantity available (not committed) per location.",
      input_schema: {
        type: "object",
        properties: { sku: { type: "string", description: "Item SKU (itemid in NetSuite)" } },
        required: ["sku"],
      },
      invoke: async (input, ctx) => {
        const v = input as { sku: string };
        await ensureConnected(ctx.workspace_id);
        const safe = v.sku.replace(/'/g, "''");
        const q = `
          select il.location, il.quantityonhand, il.quantityavailable, i.itemid, i.displayname
          from inventoryitemlocations il
          join item i on i.id = il.item
          where i.itemid = '${safe}'
        `;
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "netsuite",
          method: "POST",
          endpoint: `/services/rest/query/v1/suiteql?limit=100`,
          headers: { Prefer: "transient" },
          data: { q },
        });
        return { content: summarize(res, "netsuite_inventory_on_hand"), is_error: !res.ok };
      },
    },
    {
      name: "netsuite_get_customer",
      description: "Fetch a NetSuite customer by internal id. Returns entity_id, company name, email, terms.",
      input_schema: {
        type: "object",
        properties: { customer_id: { type: "string" } },
        required: ["customer_id"],
      },
      invoke: async (input, ctx) => {
        const v = input as { customer_id: string };
        await ensureConnected(ctx.workspace_id);
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "netsuite",
          method: "GET",
          endpoint: `/services/rest/record/v1/customer/${encodeURIComponent(v.customer_id)}`,
        });
        return { content: summarize(res, "netsuite_get_customer"), is_error: !res.ok };
      },
    },
    {
      name: "netsuite_create_sales_order",
      description:
        "Create a NetSuite Sales Order. Approval-gated by default. Shadow-mode-safe — returns a stub without posting. `entity` is the customer internal id; `item_lines` reference item internal ids.",
      input_schema: {
        type: "object",
        properties: {
          entity: { type: "string", description: "Customer internal id" },
          tran_date: { type: "string", description: "ISO date YYYY-MM-DD" },
          memo: { type: "string" },
          item_lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                item: { type: "string", description: "Item internal id" },
                quantity: { type: "number" },
                rate: { type: "number", description: "Per-unit price; omit to use NetSuite default" },
              },
              required: ["item", "quantity"],
            },
          },
        },
        required: ["entity", "item_lines"],
      },
      invoke: async (input, ctx) => {
        const v = input as {
          entity: string;
          tran_date?: string;
          memo?: string;
          item_lines: Array<{ item: string; quantity: number; rate?: number }>;
        };
        await ensureConnected(ctx.workspace_id);
        if (ctx.shadow_mode) {
          return {
            content: `[shadow_mode] would create NetSuite SO for customer ${v.entity}, ${v.item_lines.length} lines`,
            meta: { shadow: true },
          };
        }
        const body = {
          entity: { id: v.entity },
          ...(v.tran_date ? { tranDate: v.tran_date } : {}),
          ...(v.memo ? { memo: v.memo } : {}),
          item: {
            items: v.item_lines.map((l) => ({
              item: { id: l.item },
              quantity: l.quantity,
              ...(l.rate != null ? { rate: l.rate } : {}),
            })),
          },
        };
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "netsuite",
          method: "POST",
          endpoint: `/services/rest/record/v1/salesOrder`,
          data: body,
        });
        return { content: summarize(res, "netsuite_create_sales_order"), is_error: !res.ok };
      },
    },
    {
      name: "netsuite_get_sales_order",
      description: "Fetch a NetSuite Sales Order by internal id with line items, status, and totals.",
      input_schema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
      invoke: async (input, ctx) => {
        const v = input as { id: string };
        await ensureConnected(ctx.workspace_id);
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "netsuite",
          method: "GET",
          endpoint: `/services/rest/record/v1/salesOrder/${encodeURIComponent(v.id)}?expandSubResources=true`,
        });
        return { content: summarize(res, "netsuite_get_sales_order"), is_error: !res.ok };
      },
    },
  ];
}
