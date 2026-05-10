-- Agent Workflow Platform — Postgres schema (v0)
-- Truth lives in this DB; the agent loop in memory is ephemeral and resumable
-- by replaying turns from the runs/turns tables.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ===== Tenancy =====

create table if not exists workspaces (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  created_at   timestamptz not null default now()
);

create table if not exists users (
  id              uuid primary key default uuid_generate_v4(),
  clerk_user_id   text unique not null,
  email           text not null,
  created_at      timestamptz not null default now()
);

create table if not exists memberships (
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  role          text not null check (role in ('owner', 'admin', 'member')),
  primary key (workspace_id, user_id)
);

-- ===== MCP server registry =====

create table if not exists mcp_servers (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid references workspaces(id) on delete cascade,  -- null = global
  slug          text not null,
  display_name  text not null,
  transport     text not null check (transport in ('stdio', 'http', 'sse')),
  config        jsonb not null,                                      -- command/url/headers
  status        text not null default 'active' check (status in ('active', 'experimental', 'disabled')),
  created_at    timestamptz not null default now(),
  unique (workspace_id, slug)
);

-- ===== Workflows =====

create table if not exists workflows (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  name            text not null,
  goal            text not null,                  -- system prompt body
  input_schema    jsonb not null default '{}',    -- Zod-compatible JSON schema
  trigger_kind    text not null check (trigger_kind in ('manual', 'webhook', 'schedule', 'email')),
  trigger_config  jsonb not null default '{}',
  tool_config     jsonb not null default '{}',    -- {mcp_servers: [...], custom_tools: [...]}
  guardrails      jsonb not null default '{}',    -- {step_cap, budget_usd, approvals: [...]}
  model           text not null default 'claude-sonnet-4-6',
  planner_model   text,                            -- optional escalation model
  version         int not null default 1,
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists workflows_workspace_idx on workflows(workspace_id) where archived = false;

-- ===== Runs =====

create table if not exists runs (
  id            uuid primary key default uuid_generate_v4(),
  workflow_id   uuid not null references workflows(id) on delete cascade,
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  workflow_version int not null,
  trigger_kind  text not null,
  input         jsonb not null,
  status        text not null default 'queued' check (status in (
    'queued', 'running', 'awaiting_approval', 'succeeded', 'failed', 'cancelled', 'budget_exceeded'
  )),
  result        jsonb,
  error         text,
  cost_usd      numeric(10,4) not null default 0,
  step_count    int not null default 0,
  shadow_mode   boolean not null default false,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists runs_workflow_status_idx on runs(workflow_id, status);
create index if not exists runs_workspace_created_idx on runs(workspace_id, created_at desc);

-- ===== Turns (one row per agent step) =====

create table if not exists turns (
  id            uuid primary key default uuid_generate_v4(),
  run_id        uuid not null references runs(id) on delete cascade,
  step          int not null,
  role          text not null check (role in ('assistant', 'tool', 'user', 'system')),
  content       jsonb not null,           -- raw message content (text + tool_use + tool_result)
  tool_name     text,
  tool_input    jsonb,
  tool_result   jsonb,
  input_tokens  int,
  output_tokens int,
  cache_read_tokens int,
  cache_write_tokens int,
  cost_usd      numeric(10,6),
  duration_ms   int,
  created_at    timestamptz not null default now()
  -- Note: no unique(run_id, step) — an assistant turn may emit multiple
  -- parallel tool_uses, each producing its own tool turn at the same step.
);

create index if not exists turns_run_step_idx on turns(run_id, step, created_at);

-- ===== Approval queue =====

create table if not exists approvals (
  id            uuid primary key default uuid_generate_v4(),
  run_id        uuid not null references runs(id) on delete cascade,
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  step          int not null,
  reason        text not null,                  -- which guardrail tripped
  pending_tool_name text not null,
  pending_tool_input jsonb not null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'edited', 'expired')),
  decided_by    uuid references users(id),
  decided_at    timestamptz,
  edited_input  jsonb,
  reject_reason text,
  created_at    timestamptz not null default now()
);

create index if not exists approvals_workspace_status_idx on approvals(workspace_id, status);

-- ===== Test cases (eval pack) =====

create table if not exists test_cases (
  id            uuid primary key default uuid_generate_v4(),
  workflow_id   uuid not null references workflows(id) on delete cascade,
  name          text not null,
  input         jsonb not null,
  rubric        text not null,                  -- natural-language pass criteria for Claude-as-judge
  expected_output_excerpt text,
  created_at    timestamptz not null default now()
);

create table if not exists test_runs (
  id              uuid primary key default uuid_generate_v4(),
  workflow_id     uuid not null references workflows(id) on delete cascade,
  workflow_version int not null,
  test_case_id    uuid not null references test_cases(id) on delete cascade,
  run_id          uuid references runs(id) on delete set null,
  passed          boolean,
  judge_verdict   jsonb,
  created_at      timestamptz not null default now()
);

-- ===== OAuth connections (Nango-managed) =====

create table if not exists connections (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  provider        text not null,
  nango_connection_id text not null,
  display_name    text,
  metadata        jsonb not null default '{}',
  status          text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, provider)
);

create index if not exists connections_workspace_idx on connections(workspace_id) where status = 'active';

-- ===== Per-workflow long-term memory =====

create table if not exists workflow_memory (
  workflow_id  uuid not null references workflows(id) on delete cascade,
  key          text not null,
  value        jsonb not null,
  updated_at   timestamptz not null default now(),
  primary key (workflow_id, key)
);
