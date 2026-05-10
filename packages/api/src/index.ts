import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { workflowsRouter } from "./routes/workflows.js";
import { runsRouter } from "./routes/runs.js";
import { approvalsRouter } from "./routes/approvals.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { catalogRouter } from "./routes/catalog.js";
import { meRouter } from "./routes/me.js";
import { connectRouter } from "./routes/connect.js";
import { workspaceContext } from "./middleware/workspace.js";
import { cors } from "hono/cors";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.WEB_URL ?? "http://localhost:3000",
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "X-Workspace-Id", "X-User-Id"],
  }),
);
app.use("*", workspaceContext);
app.get("/health", (c) => c.json({ ok: true }));
app.route("/v1/me", meRouter);
app.route("/v1/connect", connectRouter);
app.route("/v1/workflows", workflowsRouter);
app.route("/v1/runs", runsRouter);
app.route("/v1/approvals", approvalsRouter);
app.route("/v1/webhooks", webhooksRouter);
app.route("/v1/catalog", catalogRouter);

const port = Number(process.env.API_PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`api listening on :${port}`);
