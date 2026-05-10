import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";

import { workflowsRouter } from "./routes/workflows.js";
import { runsRouter } from "./routes/runs.js";
import { approvalsRouter } from "./routes/approvals.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { catalogRouter } from "./routes/catalog.js";
import { meRouter } from "./routes/me.js";
import { connectRouter, connectWebhookRouter } from "./routes/connect.js";
import { statsRouter } from "./routes/stats.js";
import { inboundRouter } from "./routes/inbound.js";
import { specDraftsRouter } from "./routes/spec-drafts.js";
import { verifyClerkJwt, requireWorkspace } from "./middleware/auth.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.WEB_URL ?? "http://localhost:3000",
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// ===== Public routes (no auth) =====
//
// Each handles its own authenticity:
//   /health                      anyone
//   /v1/connect/webhook          Nango webhook — verify HMAC sig (TODO)
//   /v1/webhooks/:workflow_id    external trigger; uses workflow_id as
//                                opaque secret (TODO: hash + per-workflow
//                                rotating tokens)

app.get("/health", (c) => c.json({ ok: true }));
app.route("/v1/connect/webhook", connectWebhookRouter);
app.route("/v1/webhooks", webhooksRouter);
app.route("/v1/webhooks/inbound-email", inboundRouter);

// ===== Bootstrap (JWT only — workspace may not exist yet) =====

const meApp = new Hono();
meApp.use("*", verifyClerkJwt);
meApp.route("/", meRouter);
app.route("/v1/me", meApp);

// ===== Authenticated + workspace-scoped routes =====

const auth = new Hono();
auth.use("*", verifyClerkJwt);
auth.use("*", requireWorkspace);

auth.route("/connect", connectRouter);
auth.route("/workflows", workflowsRouter);
auth.route("/runs", runsRouter);
auth.route("/approvals", approvalsRouter);
auth.route("/catalog", catalogRouter);
auth.route("/stats", statsRouter);
auth.route("/spec-drafts", specDraftsRouter);

app.route("/v1", auth);

const port = Number(process.env.API_PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`api listening on :${port}`);
