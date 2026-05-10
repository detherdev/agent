import type { ToolDefinition } from "../types.js";
import { nangoProxy, summarize } from "./nango.js";

/**
 * Slack via the Web API. Useful for routing approvals/notifications to a
 * channel where the team already lives.
 */
export function slackTools(): ToolDefinition[] {
  return [
    {
      name: "slack_post_message",
      description:
        "Post a Slack message to a channel (use channel id or '#name'). " +
        "Shadow-mode safe.",
      input_schema: {
        type: "object",
        properties: {
          channel: { type: "string" },
          text: { type: "string" },
          thread_ts: { type: "string", description: "Optional parent thread ts to reply in-thread" },
        },
        required: ["channel", "text"],
      },
      invoke: async (input, ctx) => {
        const { channel, text, thread_ts } = input as {
          channel: string;
          text: string;
          thread_ts?: string;
        };
        if (ctx.shadow_mode) {
          return {
            content: `[shadow_mode] would slack ${channel}: ${text.slice(0, 200)}`,
            meta: { shadow: true },
          };
        }
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "slack",
          method: "POST",
          endpoint: "/api/chat.postMessage",
          data: { channel, text, ...(thread_ts ? { thread_ts } : {}) },
        });
        return { content: summarize(res, "slack_post_message"), is_error: !res.ok };
      },
    },
    {
      name: "slack_search_messages",
      description: "Search Slack messages with Slack's standard search syntax.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          count: { type: "integer", default: 20, maximum: 100 },
        },
        required: ["query"],
      },
      invoke: async (input, ctx) => {
        const { query, count } = input as { query: string; count?: number };
        const res = await nangoProxy({
          workspaceId: ctx.workspace_id,
          provider: "slack",
          method: "GET",
          endpoint: "/api/search.messages",
          query: { query, count: Math.min(count ?? 20, 100) },
        });
        return { content: summarize(res, "slack_search_messages"), is_error: !res.ok };
      },
    },
  ];
}
