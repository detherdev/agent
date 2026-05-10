import type { ToolDefinition } from "../types.js";
import { nangoProxy, summarize } from "./nango.js";

/**
 * Microsoft Outlook (mail) via Microsoft Graph. Mirror of the Gmail tool
 * shape so workflow prompts can swap providers with minimal edits.
 *
 * Graph base path is /v1.0/me/messages; Nango handles OAuth + token refresh.
 */
export function outlookTools(): ToolDefinition[] {
  return [
    {
      name: "outlook_search",
      description:
        "Search the connected Outlook mailbox. Pass a Microsoft Graph $search filter " +
        "(e.g. '\"from:billing@vendor.com\"' or '\"subject:invoice\"'). Returns up to 25 stubs.",
      input_schema: {
        type: "object",
        properties: {
          search: { type: "string" },
          top: { type: "integer", default: 25, maximum: 50 },
        },
        required: ["search"],
      },
      invoke: async (input, ctx) => {
        const { search, top } = input as { search: string; top?: number };
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "outlook",
          method: "GET",
          endpoint: "/v1.0/me/messages",
          query: { $search: search, $top: Math.min(top ?? 25, 50) },
        });
        return { content: summarize(res, "outlook_search"), is_error: !res.ok };
      },
    },
    {
      name: "outlook_get_message",
      description: "Fetch a single Outlook message by id with body + attachments metadata.",
      input_schema: {
        type: "object",
        properties: { message_id: { type: "string" } },
        required: ["message_id"],
      },
      invoke: async (input, ctx) => {
        const { message_id } = input as { message_id: string };
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "outlook",
          method: "GET",
          endpoint: `/v1.0/me/messages/${encodeURIComponent(message_id)}`,
          query: { $expand: "attachments" },
        });
        return { content: summarize(res, "outlook_get_message"), is_error: !res.ok };
      },
    },
    {
      name: "outlook_send",
      description:
        "Send an email from the connected Outlook account. Shadow-mode safe — logs " +
        "instead of sending.",
      input_schema: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string", description: "Plain text" },
        },
        required: ["to", "subject", "body"],
      },
      invoke: async (input, ctx) => {
        const { to, subject, body } = input as { to: string; subject: string; body: string };
        if (ctx.shadow_mode) {
          return {
            content: `[shadow_mode] would send Outlook mail to ${to} with subject "${subject}"`,
            meta: { shadow: true },
          };
        }
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "outlook",
          method: "POST",
          endpoint: "/v1.0/me/sendMail",
          data: {
            message: {
              subject,
              body: { contentType: "Text", content: body },
              toRecipients: [{ emailAddress: { address: to } }],
            },
            saveToSentItems: true,
          },
        });
        return { content: summarize(res, "outlook_send"), is_error: !res.ok };
      },
    },
  ];
}
