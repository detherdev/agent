import type { ToolDefinition } from "../types.js";
import { nangoProxy, summarize } from "./nango.js";

/**
 * Stripe via the standard REST API. Nango handles secret-key auth.
 * Only the most-used surface is wired here — extend as needed.
 */
export function stripeTools(): ToolDefinition[] {
  return [
    {
      name: "stripe_search_customer",
      description:
        "Find a Stripe customer by email or name. Uses Stripe's search syntax: " +
        "'email:\"foo@bar.com\"' or 'name:\"Acme Inc\"'.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
      invoke: async (input, ctx) => {
        const { query } = input as { query: string };
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "stripe",
          method: "GET",
          endpoint: "/v1/customers/search",
          query: { query, limit: 25 },
        });
        return { content: summarize(res, "stripe_search_customer"), is_error: !res.ok };
      },
    },
    {
      name: "stripe_list_invoices",
      description: "List Stripe invoices, optionally filtered by customer or status.",
      input_schema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Customer id (cus_...)" },
          status: { type: "string", enum: ["draft", "open", "paid", "uncollectible", "void"] },
          limit: { type: "integer", default: 25, maximum: 100 },
        },
      },
      invoke: async (input, ctx) => {
        const { customer, status, limit } = input as {
          customer?: string;
          status?: string;
          limit?: number;
        };
        const q: Record<string, string | number> = { limit: Math.min(limit ?? 25, 100) };
        if (customer) q.customer = customer;
        if (status) q.status = status;
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "stripe",
          method: "GET",
          endpoint: "/v1/invoices",
          query: q,
        });
        return { content: summarize(res, "stripe_list_invoices"), is_error: !res.ok };
      },
    },
    {
      name: "stripe_create_invoice_item",
      description:
        "Create an invoice line item on a draft invoice (or auto-attach to next invoice). " +
        "Shadow-mode safe.",
      input_schema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Customer id (cus_...)" },
          amount_cents: { type: "integer" },
          currency: { type: "string", description: "ISO 4217 lowercase, e.g. 'usd'" },
          description: { type: "string" },
        },
        required: ["customer", "amount_cents", "currency", "description"],
      },
      invoke: async (input, ctx) => {
        const v = input as { customer: string; amount_cents: number; currency: string; description: string };
        if (ctx.shadow_mode) {
          return {
            content: `[shadow_mode] would create Stripe invoice item: ${v.description} ${v.currency} ${(v.amount_cents / 100).toFixed(2)} for ${v.customer}`,
            meta: { shadow: true },
          };
        }
        const body = new URLSearchParams({
          customer: v.customer,
          amount: String(v.amount_cents),
          currency: v.currency,
          description: v.description,
        });
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "stripe",
          method: "POST",
          endpoint: "/v1/invoiceitems",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          data: body.toString(),
        });
        return { content: summarize(res, "stripe_create_invoice_item"), is_error: !res.ok };
      },
    },
  ];
}
