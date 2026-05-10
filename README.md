# Agent Workflow Platform

Agent-native workflow runtime for professional-services SMBs. Each workflow is
a Claude agent loop with tools, memory, guardrails, test cases, and a
human-in-the-loop approval queue. Not a node graph.

## Why

Existing workflow tools (Gumloop, n8n, Make) treat workflows as deterministic
DAGs with an LLM call inside one node. That model breaks for the work
professional-services SMBs actually do — every invoice PDF, every diligence
packet, every CV is shaped slightly differently.

Here, the workflow **is** the agent. You define the goal, the tools, and the
guardrails; Claude decides what to do per turn. Brittle node graphs become an
adaptive loop with full traceability.

## Repo layout

```
packages/
  runtime/   Agent loop, MCP client, tools, guardrails, state, trace
  api/       Hono HTTP API + BullMQ worker
  web/       Next.js builder, run inspector, approval inbox
  evals/     Test pack runner (Claude-as-judge)
db/          Postgres schema
packs/
  bookkeeping/  Vertical pack v1 — prebuilt workflows for bookkeeping firms
```

## Stack

- TypeScript everywhere
- **Runtime**: Anthropic SDK + MCP client
- **API**: Hono on Node, BullMQ + Redis for long-running agent loops
- **Web**: Next.js + Tailwind + shadcn/ui (Vercel)
- **DB**: Postgres (Neon)
- **Auth**: Clerk
- **Models**: Claude Sonnet 4.6 default, Opus 4.7 for planning-heavy steps,
  prompt caching on system + tools + memory

## Quickstart

You need accounts on three services to run end-to-end:
1. **Anthropic** — for the agent itself (`ANTHROPIC_API_KEY`)
2. **Clerk** — for sign-in / sign-up (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`)
3. **Nango** — for OAuth into Gmail/QuickBooks/etc. (`NANGO_SECRET_KEY` + `NEXT_PUBLIC_NANGO_PUBLIC_KEY`)

```bash
pnpm install
cp .env.example .env             # fill in keys

docker compose up -d             # postgres + redis on default ports
pnpm verify                      # apply schema + install bookkeeping pack

pnpm dev:api                     # API on :3001
pnpm dev:web                     # web on :3000
pnpm dev:worker                  # agent worker (consumes runs queue)
pnpm dev:triggers                # schedule + email trigger producer
```

`dev:worker` and `dev:triggers` are separate processes on purpose: the
worker runs agent loops (long-lived, restartable per run); the trigger
worker decides *when* to enqueue runs (cron tick + Gmail poll). In prod
you'd run them as separate Fly machines or k8s deployments.

## User journey (what a new SMB sees)

```
/sign-up                 → Clerk hosted form (email or Google)
/                        → bootstraps a workspace, redirects:
                           • not signed in   → /sign-in
                           • not onboarded   → /onboarding
                           • onboarded       → /inbox

/onboarding              → Step 1: pick a job (cards from packs/)
/onboarding/connect      → Step 2: connect Gmail / QuickBooks via Nango
/onboarding/done         → Step 3: done; links to /inbox and /jobs

/inbox                   → daily UI: pending approvals
/jobs                    → add more jobs anytime
/connect                 → manage connected accounts
```

## Verifying it works

Three layers, each catches a different class of bug:

1. **`pnpm verify`** — install round-trip. Applies schema + migrations,
   installs the bookkeeping pack, asserts the right rows exist with the
   right shape. Fast, no Anthropic key required.
2. **`pnpm evals <workflow_id>`** — runs the workflow's test cases through
   the agent loop in shadow mode, judged by Claude. This is the
   agent-correctness layer. Requires `ANTHROPIC_API_KEY`.
3. **`pnpm test:e2e`** — Playwright. The job-picker UI tests are skipped
   until Clerk test setup is wired (see `packages/web/tests/jobs.spec.ts`);
   the API-surface tests run against a live API.

## Verifying it works

Three layers, each catches a different class of bug:

1. **`pnpm verify`** — install round-trip. Applies schema + migrations,
   installs the bookkeeping pack, asserts the right rows exist with the
   right shape. Fast, no Anthropic key required.
2. **`pnpm evals <workflow_id>`** — runs the workflow's test cases through
   the agent loop in shadow mode, judged by Claude. This is the
   agent-correctness layer. Requires `ANTHROPIC_API_KEY`.
3. **`pnpm test:e2e`** — Playwright loads `/jobs`, clicks Install, asserts
   the workflow is created. Catches API/UI wiring breakage. Requires
   `pnpm verify` to have seeded the DB first.

## Status

v0 scaffold. See `/root/.claude/plans/starting-a-new-project-gentle-church.md`
for the full plan and MVP scope.
