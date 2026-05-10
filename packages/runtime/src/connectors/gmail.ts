import type { ToolDefinition } from "../types.js";
import { nangoProxy, summarize } from "./nango.js";

export function gmailTools(): ToolDefinition[] {
  return [
    {
      name: "gmail_search",
      description:
        "Search the user's Gmail using Gmail query syntax (e.g. 'from:billing@vendor.com newer_than:7d has:attachment'). Returns up to 20 message stubs (id, threadId, snippet).",
      input_schema: {
        type: "object",
        properties: {
          q: { type: "string", description: "Gmail search query" },
          max_results: { type: "integer", default: 20, maximum: 50 },
        },
        required: ["q"],
      },
      invoke: async (input, ctx) => {
        const { q, max_results } = input as { q: string; max_results?: number };
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "gmail",
          method: "GET",
          endpoint: "/gmail/v1/users/me/messages",
          query: { q, maxResults: Math.min(max_results ?? 20, 50) },
        });
        return { content: summarize(res, "gmail_search"), is_error: !res.ok };
      },
    },
    {
      name: "gmail_get_message",
      description: "Fetch a Gmail message by id. Returns headers, plain-text body, and attachment metadata.",
      input_schema: {
        type: "object",
        properties: {
          message_id: { type: "string" },
        },
        required: ["message_id"],
      },
      invoke: async (input, ctx) => {
        const { message_id } = input as { message_id: string };
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "gmail",
          method: "GET",
          endpoint: `/gmail/v1/users/me/messages/${encodeURIComponent(message_id)}`,
          query: { format: "full" },
        });
        return { content: summarize(res, "gmail_get_message"), is_error: !res.ok };
      },
    },
    {
      name: "gmail_send",
      description:
        "Send an email from the connected Gmail account. Provide to, subject, and body. " +
        "In shadow mode this is logged but not actually sent.",
      input_schema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string" },
          body: { type: "string", description: "Plain-text body" },
          in_reply_to: { type: "string", description: "Optional message id to thread the reply" },
        },
        required: ["to", "subject", "body"],
      },
      invoke: async (input, ctx) => {
        const { to, subject, body, in_reply_to } = input as {
          to: string;
          subject: string;
          body: string;
          in_reply_to?: string;
        };

        if (ctx.shadow_mode) {
          return {
            content: `[shadow_mode] would have sent email to ${to} with subject "${subject}"`,
            meta: { shadow: true },
          };
        }

        const headers = [
          `To: ${to}`,
          `Subject: ${subject}`,
          "Content-Type: text/plain; charset=UTF-8",
          in_reply_to ? `In-Reply-To: ${in_reply_to}` : "",
        ]
          .filter(Boolean)
          .join("\r\n");
        const raw = Buffer.from(`${headers}\r\n\r\n${body}`).toString("base64url");

        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "gmail",
          method: "POST",
          endpoint: "/gmail/v1/users/me/messages/send",
          data: { raw },
        });
        return { content: summarize(res, "gmail_send"), is_error: !res.ok };
      },
    },
  ];
}
