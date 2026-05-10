import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  GREETING,
  loadDiscovery,
  sendDiscoveryMessage,
  startDiscovery,
} from "../services/discovery-assistant.js";

export const discoveryRouter = new Hono();

discoveryRouter.post("/", async (c) => {
  const workspaceId = c.get("workspace_id");
  const userId = c.get("user_id");
  const draft = await startDiscovery(workspaceId, userId);
  return c.json({ ...draft, greeting: GREETING }, 201);
});

discoveryRouter.get("/:id", async (c) => {
  const workspaceId = c.get("workspace_id");
  const draft = await loadDiscovery(c.req.param("id"), workspaceId);
  if (!draft) return c.json({ error: "not found" }, 404);
  return c.json(draft);
});

const Msg = z.object({ text: z.string().min(1).max(8000) });

discoveryRouter.post("/:id/messages", zValidator("json", Msg), async (c) => {
  const workspaceId = c.get("workspace_id");
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const result = await sendDiscoveryMessage(id, workspaceId, body.text);
  return c.json(result);
});
