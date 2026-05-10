-- Per-workflow trigger state. Used by the trigger worker to decide when
-- to fire scheduled runs and which Gmail messages it has already seen.
--
--   last_fired_at   → set after every schedule fire
--   last_polled_at  → set after each email-poll iteration
--   trigger_state   → opaque per-trigger metadata (e.g. last seen Gmail
--                     historyId, last gmail message id)

alter table workflows
  add column if not exists last_fired_at  timestamptz,
  add column if not exists last_polled_at timestamptz,
  add column if not exists trigger_state  jsonb not null default '{}'::jsonb;

create index if not exists workflows_trigger_kind_idx
  on workflows(trigger_kind) where archived = false;
