-- Workflows can be installed in a "paused" state — runs can be triggered
-- manually (e.g. by the test pack runner in shadow mode) but the schedule
-- / email / drive trigger workers skip them. Used by the practice-run
-- wizard so a fresh install doesn't auto-fire before the user has
-- reviewed test results.
--
-- Existing rows stay live (is_paused = false default).

alter table workflows
  add column if not exists is_paused boolean not null default false;

create index if not exists workflows_active_idx
  on workflows(workspace_id) where archived = false and is_paused = false;
