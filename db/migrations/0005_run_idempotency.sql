-- De-duplicate trigger fires across worker restarts and double-tick races.
--
-- A trigger producer computes a stable dedup_key per (workflow, event):
--   email     dedup_key = "gmail:<message_id>"
--   schedule  dedup_key = "<cron>@<fire_time_iso_to_minute>"
--   webhook   dedup_key = body.idempotency_key (if present)
--   manual    dedup_key = NULL  (always allowed)
--
-- INSERT ... ON CONFLICT DO NOTHING is the dedupe primitive.

alter table runs add column if not exists dedup_key text;

create unique index if not exists runs_workflow_dedup_uniq
  on runs(workflow_id, dedup_key)
  where dedup_key is not null;
