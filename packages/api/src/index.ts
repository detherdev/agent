import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { workflowsRouter } from "./routes/workflows.js";
import { runsRouter } from "./routes/runs.js";
import { approvalsRouter } from "./routes/approvals.js";
import { webhooksRouter } from "./routes/webhooks.js";

const app = new Hono();

app.use("*", logger());
app.get("/health", (c) => c.json({ ok: true }));
app.route("/v1/workflows", workflowsRouter);
app.route("/v1/runs", runsRouter);
app.route("/v1/approvals", approvalsRouter);
app.route("/v1/webhooks", webhooksRouter);

const port = Number(process.env.API_PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`api listening on :${port}`);
