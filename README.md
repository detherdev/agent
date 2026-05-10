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

```bash
pnpm install
cp .env.example .env             # fill in keys

docker compose up -d             # postgres + redis on default ports
pnpm verify                      # apply schema + install bookkeeping pack
                                 #   asserts the install round-trip is sound

pnpm dev:api                     # API on :3001
pnpm dev:web                     # web on :3000  → /jobs and /inbox
pnpm dev:worker                  # agent worker (separate terminal)

# Optional
pnpm test:e2e                    # Playwright (run `pnpm --filter web test:e2e:install` first)
pnpm evals <workflow_id>         # run a workflow's test pack with Claude-as-judge
```

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
