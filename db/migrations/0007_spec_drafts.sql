-- Spec drafts: a long-lived conversation between the user and the Setup
-- Assistant agent, plus the current proposed WorkflowInstallSpec the user
-- is iterating on. Distinct from `runs` (which capture executions) — these
-- are pre-execution design artifacts.

create table if not exists spec_drafts (
  id                    uuid primary key default uuid_generate_v4(),
  workspace_id          uuid not null references workspaces(id) on delete cascade,
  user_id               uuid not null references users(id) on delete cascade,
  messages              jsonb not null default '[]'::jsonb,   -- Anthropic message array
  proposed_spec         jsonb,                                 -- null until first propose_spec call
  status                text not null default 'drafting' check (status in ('drafting','ready','installed','archived')),
  installed_workflow_id uuid references workflows(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists spec_drafts_workspace_idx on spec_drafts(workspace_id, updated_at desc);
