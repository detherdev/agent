-- Multiple tool turns can share a step (one per parallel tool_use in the
-- assistant's message). Replace the unique constraint with a plain index.

alter table turns drop constraint if exists turns_run_id_step_key;
create index if not exists turns_run_step_idx_v2 on turns(run_id, step);
