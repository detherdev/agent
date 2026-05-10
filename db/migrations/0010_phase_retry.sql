-- Phase-level retry support.
--   max_retries     hard limit; 0 = no retry (default keeps existing semantics)
--   retry_count     attempts so far for THIS phase (not counting the initial run)
--   retry_after     don't promote until now() >= retry_after (exponential backoff)
--
-- On phase failure the orchestrator now decides: if retry_count < max_retries,
-- reset to pending with retry_after = now + backoff. Else mark failed and
-- fail the task as before.

alter table task_phases
  add column if not exists max_retries int not null default 0,
  add column if not exists retry_count int not null default 0,
  add column if not exists retry_after timestamptz;
