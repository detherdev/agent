-- Tasks: long-running, multi-phase work above the per-run agent loop.
--
-- A Task is the durable durable thing; phases are checkpoints. A phase
-- either fires a workflow run OR pauses on a human gate (which uses the
-- existing approvals primitive). When the orchestrator tick observes all
-- phases reached terminal-success, the task is marked succeeded.

create table if not exists tasks (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  template_slug   text,                                       -- e.g. 'bookkeeping/weekly-ar-review'
  name            text not null,
  status          text not null default 'pending' check (status in (
                    'pending','running','awaiting_human','succeeded','failed','cancelled'
                  )),
  state           jsonb not null default '{}'::jsonb,         -- persistent task memory
  input           jsonb not null default '{}'::jsonb,         -- the initial trigger input
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
  workflow_id         uuid references workflows(id) on delete set null,  -- null = human-gate-only phase
  human_gate          boolean not null default false,
  human_instructions  text,
  depends_on          jsonb not null default '[]'::jsonb,                -- array of order_idx
  not_before          timestamptz,
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

-- Approvals can now also gate a task phase (not just a paused run).
alter table approvals alter column run_id drop not null;
alter table approvals add column if not exists task_phase_id uuid references task_phases(id) on delete cascade;
alter table approvals
  drop constraint if exists approvals_subject_check,
  add constraint approvals_subject_check check (
    (run_id is not null and task_phase_id is null) or
    (run_id is null and task_phase_id is not null)
  );

create index if not exists approvals_task_phase_idx on approvals(task_phase_id) where task_phase_id is not null;
