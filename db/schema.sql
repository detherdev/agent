-- Agent Workflow Platform — Postgres schema (v0)
-- Truth lives in this DB; the agent loop in memory is ephemeral and resumable
-- by replaying turns from the runs/turns tables.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ===== Tenancy =====

create table if not exists workspaces (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  onboarding_step smallint not null default 0,
  inbox_address   text,
  plan_tier       text not null default 'trial' check (plan_tier in ('trial','starter','pro','enterprise')),
  trial_ends_at   timestamptz,
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  created_at      timestamptz not null default now()
);

create unique index if not exists workspaces_inbox_address_uniq
  on workspaces(inbox_address) where inbox_address is not null;
create unique index if not exists workspaces_stripe_customer_idx
  on workspaces(stripe_customer_id) where stripe_customer_id is not null;

-- ===== Billing usage counters =====

create table if not exists usage_counters (
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  run_count     int not null default 0,
  cost_usd      numeric(12, 6) not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, period_start)
);

create index if not exists usage_counters_lookup_idx
  on usage_counters(workspace_id, period_end desc);

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
  is_paused       boolean not null default false,
  last_fired_at   timestamptz,
  last_polled_at  timestamptz,
  trigger_state   jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists workflows_workspace_idx on workflows(workspace_id) where archived = false;
create index if not exists workflows_trigger_kind_idx on workflows(trigger_kind) where archived = false;
create index if not exists workflows_active_idx on workflows(workspace_id) where archived = false and is_paused = false;

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
  dedup_key     text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);

create unique index if not exists runs_workflow_dedup_uniq
  on runs(workflow_id, dedup_key)
  where dedup_key is not null;

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
  run_id        uuid references runs(id) on delete cascade,
  task_phase_id uuid,  -- references task_phases(id); FK added after that table is declared below
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  step          int not null default 0,
  reason        text not null,                  -- which guardrail tripped / human gate
  pending_tool_name text not null default '',
  pending_tool_input jsonb not null default '{}'::jsonb,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'edited', 'expired')),
  decided_by    uuid references users(id),
  decided_at    timestamptz,
  edited_input  jsonb,
  reject_reason text,
  created_at    timestamptz not null default now(),
  constraint approvals_subject_check check (
    (run_id is not null and task_phase_id is null) or
    (run_id is null and task_phase_id is not null)
  )
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

-- ===== Spec drafts (Setup Assistant conversations) =====

create table if not exists spec_drafts (
  id                    uuid primary key default uuid_generate_v4(),
  workspace_id          uuid not null references workspaces(id) on delete cascade,
  user_id               uuid not null references users(id) on delete cascade,
  messages              jsonb not null default '[]'::jsonb,
  proposed_spec         jsonb,
  status                text not null default 'drafting' check (status in ('drafting','ready','installed','archived')),
  installed_workflow_id uuid references workflows(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists spec_drafts_workspace_idx on spec_drafts(workspace_id, updated_at desc);

-- ===== Tasks (long-running, multi-phase workflows) =====

create table if not exists tasks (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  template_slug   text,
  name            text not null,
  status          text not null default 'pending' check (status in (
                    'pending','running','awaiting_human','succeeded','failed','cancelled'
                  )),
  state           jsonb not null default '{}'::jsonb,
  input           jsonb not null default '{}'::jsonb,
  result          jsonb,
  error           text,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);

create index if not exists tasks_workspace_status_idx on tasks(workspace_id, status, created_at desc);
create index if not exists tasks_running_idx on tasks(status) where status in ('pending','running','awaiting_human');

create table if not exists task_phases (
  id                  uuid primary key default uuid_generate_v4(),
  task_id             uuid not null references tasks(id) on delete cascade,
  order_idx           int not null,
  name                text not null,
  workflow_id         uuid references workflows(id) on delete set null,
  human_gate          boolean not null default false,
  human_instructions  text,
  depends_on          jsonb not null default '[]'::jsonb,
  not_before          timestamptz,
  max_retries         int not null default 0,
  retry_count         int not null default 0,
  retry_after         timestamptz,
  status              text not null default 'pending' check (status in (
                        'pending','ready','running','awaiting_human','succeeded','failed','skipped','cancelled'
                      )),
  run_id              uuid references runs(id) on delete set null,
  input               jsonb,
  output              jsonb,
  error               text,
  created_at          timestamptz not null default now(),
  started_at          timestamptz,
  finished_at         timestamptz,
  unique (task_id, order_idx)
);

create index if not exists task_phases_task_idx on task_phases(task_id, order_idx);
create index if not exists task_phases_status_idx on task_phases(status) where status in ('pending','ready','running','awaiting_human');

-- Now that task_phases exists, retro-fit the FK from approvals.task_phase_id.
do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'approvals_task_phase_id_fkey'
  ) then
    alter table approvals
      add constraint approvals_task_phase_id_fkey
      foreign key (task_phase_id) references task_phases(id) on delete cascade;
  end if;
end $$;

create index if not exists approvals_task_phase_idx on approvals(task_phase_id) where task_phase_id is not null;

-- ===== Marketing leads (pre-signup demo / waitlist captures) =====

create table if not exists leads (
  id          uuid primary key default uuid_generate_v4(),
  email       text not null,
  name        text,
  company     text,
  size        text,
  vertical    text,
  message     text,
  source      text,
  referrer    text,
  utm_source  text,
  utm_medium  text,
  utm_campaign text,
  status      text not null default 'new' check (status in ('new','contacted','qualified','closed_won','closed_lost')),
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists leads_status_created_idx on leads(status, created_at desc);
create index if not exists leads_email_idx on leads(email);

-- ===== Per-workflow long-term memory =====

create table if not exists workflow_memory (
  workflow_id  uuid not null references workflows(id) on delete cascade,
  key          text not null,
  value        jsonb not null,
  updated_at   timestamptz not null default now(),
  primary key (workflow_id, key)
);
