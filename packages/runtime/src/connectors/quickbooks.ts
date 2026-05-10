import type { ToolDefinition } from "../types.js";
import { nangoProxy, summarize, getConnection } from "./nango.js";

interface QuickBooksMeta {
  realm_id?: string;
}

async function realm(workspaceId: string): Promise<string> {
  const conn = await getConnection(workspaceId, "quickbooks");
  if (!conn) throw new Error("quickbooks not connected");
  const meta = (conn as unknown as { metadata?: QuickBooksMeta }).metadata ?? {};
  if (!meta.realm_id) throw new Error("quickbooks connection has no realm_id in metadata");
  return meta.realm_id;
}

export function quickBooksTools(): ToolDefinition[] {
  return [
    {
      name: "quickbooks_search_vendor",
      description: "Find a QuickBooks vendor by display name (exact match). Returns vendor or null.",
      input_schema: {
        type: "object",
        properties: { display_name: { type: "string" } },
        required: ["display_name"],
      },
      invoke: async (input, ctx) => {
        const { display_name } = input as { display_name: string };
        const realmId = await realm(ctx.workspace_id);
        const sql = `select * from Vendor where DisplayName = '${display_name.replace(/'/g, "''")}'`;
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "quickbooks",
          method: "GET",
          endpoint: `/v3/company/${realmId}/query`,
          query: { query: sql, minorversion: 75 },
          headers: { Accept: "application/json" },
        });
        return { content: summarize(res, "quickbooks_search_vendor"), is_error: !res.ok };
      },
    },
    {
      name: "quickbooks_create_vendor",
      description: "Create a QuickBooks vendor. In shadow mode this is logged but not posted.",
      input_schema: {
        type: "object",
        properties: {
          display_name: { type: "string" },
          email: { type: "string" },
          currency: { type: "string", description: "ISO 4217 code, e.g. USD" },
        },
        required: ["display_name"],
      },
      invoke: async (input, ctx) => {
        const v = input as { display_name: string; email?: string; currency?: string };
        if (ctx.shadow_mode) {
          return { content: `[shadow_mode] would have created vendor ${v.display_name}`, meta: { shadow: true } };
        }
        const realmId = await realm(ctx.workspace_id);
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "quickbooks",
          method: "POST",
          endpoint: `/v3/company/${realmId}/vendor`,
          query: { minorversion: 75 },
          headers: { Accept: "application/json" },
          data: {
            DisplayName: v.display_name,
            ...(v.email ? { PrimaryEmailAddr: { Address: v.email } } : {}),
            ...(v.currency ? { CurrencyRef: { value: v.currency } } : {}),
          },
        });
        return { content: summarize(res, "quickbooks_create_vendor"), is_error: !res.ok };
      },
    },
    {
      name: "quickbooks_search_bills",
      description: "Search QuickBooks bills by vendor display name and/or document number. Returns matching bills.",
      input_schema: {
        type: "object",
        properties: {
          vendor_display_name: { type: "string" },
          doc_number: { type: "string" },
        },
      },
      invoke: async (input, ctx) => {
        const { vendor_display_name, doc_number } = input as { vendor_display_name?: string; doc_number?: string };
        const realmId = await realm(ctx.workspace_id);
        const where: string[] = [];
        if (vendor_display_name) where.push(`VendorRef.name = '${vendor_display_name.replace(/'/g, "''")}'`);
        if (doc_number) where.push(`DocNumber = '${doc_number.replace(/'/g, "''")}'`);
        const sql = `select * from Bill ${where.length ? "where " + where.join(" and ") : ""}`;
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "quickbooks",
          method: "GET",
          endpoint: `/v3/company/${realmId}/query`,
          query: { query: sql, minorversion: 75 },
          headers: { Accept: "application/json" },
        });
        return { content: summarize(res, "quickbooks_search_bills"), is_error: !res.ok };
      },
    },
    {
      name: "quickbooks_create_bill",
      description: "Create a QuickBooks bill (vendor invoice) as a draft. Approval-gated by default. Shadow-mode-safe.",
      input_schema: {
        type: "object",
        properties: {
          vendor_id: { type: "string" },
          doc_number: { type: "string", description: "Original invoice number from the vendor" },
          txn_date: { type: "string", description: "ISO date" },
          due_date: { type: "string", description: "ISO date" },
          currency: { type: "string", description: "ISO 4217" },
          line_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                amount: { type: "number" },
                account_id: { type: "string" },
              },
              required: ["description", "amount"],
            },
          },
          notes: { type: "string" },
        },
        required: ["vendor_id", "line_items"],
      },
      invoke: async (input, ctx) => {
        const v = input as {
          vendor_id: string;
          doc_number?: string;
          txn_date?: string;
          due_date?: string;
          currency?: string;
          line_items: Array<{ description: string; amount: number; account_id?: string }>;
          notes?: string;
        };

        if (ctx.shadow_mode) {
          const total = v.line_items.reduce((s, li) => s + li.amount, 0);
          return {
            content: `[shadow_mode] would have created bill (vendor ${v.vendor_id}, ${v.line_items.length} lines, total ${v.currency ?? ""}${total.toFixed(2)})`,
            meta: { shadow: true },
          };
        }

        const realmId = await realm(ctx.workspace_id);
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "quickbooks",
          method: "POST",
          endpoint: `/v3/company/${realmId}/bill`,
          query: { minorversion: 75 },
          headers: { Accept: "application/json" },
          data: {
            VendorRef: { value: v.vendor_id },
            ...(v.doc_number ? { DocNumber: v.doc_number } : {}),
            ...(v.txn_date ? { TxnDate: v.txn_date } : {}),
            ...(v.due_date ? { DueDate: v.due_date } : {}),
            ...(v.currency ? { CurrencyRef: { value: v.currency } } : {}),
            ...(v.notes ? { PrivateNote: v.notes } : {}),
            Line: v.line_items.map((li) => ({
              DetailType: "AccountBasedExpenseLineDetail",
              Amount: li.amount,
              Description: li.description,
              ...(li.account_id
                ? { AccountBasedExpenseLineDetail: { AccountRef: { value: li.account_id } } }
                : { AccountBasedExpenseLineDetail: {} }),
            })),
          },
        });
        return { content: summarize(res, "quickbooks_create_bill"), is_error: !res.ok };
      },
    },
    {
      name: "quickbooks_search_invoices",
      description:
        "Find QuickBooks invoices (outgoing — money owed TO you). Filter by overdue, customer name, or balance. Returns up to 50 invoices.",
      input_schema: {
        type: "object",
        properties: {
          overdue: { type: "boolean", description: "Only invoices past due (DueDate < today, Balance > 0)" },
          customer_display_name: { type: "string" },
          min_balance: { type: "number", description: "Minimum outstanding balance" },
        },
      },
      invoke: async (input, ctx) => {
        const { overdue, customer_display_name, min_balance } = input as {
          overdue?: boolean;
          customer_display_name?: string;
          min_balance?: number;
        };
        const realmId = await realm(ctx.workspace_id);
        const where: string[] = [];
        if (overdue) {
          const today = new Date().toISOString().slice(0, 10);
          where.push(`Balance > '0'`, `DueDate < '${today}'`);
        }
        if (customer_display_name) where.push(`CustomerRef.name = '${customer_display_name.replace(/'/g, "''")}'`);
        if (typeof min_balance === "number") where.push(`Balance >= '${min_balance}'`);
        const sql = `select * from Invoice ${where.length ? "where " + where.join(" and ") : ""} maxresults 50`;
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "quickbooks",
          method: "GET",
          endpoint: `/v3/company/${realmId}/query`,
          query: { query: sql, minorversion: 75 },
          headers: { Accept: "application/json" },
        });
        return { content: summarize(res, "quickbooks_search_invoices"), is_error: !res.ok };
      },
    },
    {
      name: "quickbooks_get_customer",
      description: "Fetch a QuickBooks customer by id. Returns name, email, billing address, currency.",
      input_schema: {
        type: "object",
        properties: { customer_id: { type: "string" } },
        required: ["customer_id"],
      },
      invoke: async (input, ctx) => {
        const { customer_id } = input as { customer_id: string };
        const realmId = await realm(ctx.workspace_id);
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "quickbooks",
          method: "GET",
          endpoint: `/v3/company/${realmId}/customer/${encodeURIComponent(customer_id)}`,
          query: { minorversion: 75 },
          headers: { Accept: "application/json" },
        });
        return { content: summarize(res, "quickbooks_get_customer"), is_error: !res.ok };
      },
    },
  ];
}
