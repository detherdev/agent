-- Subagent runs.
--
-- A run can spawn child runs via the `delegate_subagent` tool. Children share
-- the parent's workflow + workspace; we just pivot the goal + input. The
-- parent's tool result for the delegate call carries the child's final
-- output, and the child's cost rolls into the parent's cost (the parent's
-- budget cap covers the whole tree).
--
-- v1 keeps recursion depth at 1: children don't get the delegate tool, so
-- they can't fan out further. Deeper trees are easy to enable later by
-- removing that filter; the schema already supports any depth.

alter table runs
  add column if not exists parent_run_id uuid references runs(id) on delete cascade,
  add column if not exists parent_step int;

create index if not exists idx_runs_parent_run_id on runs(parent_run_id) where parent_run_id is not null;
