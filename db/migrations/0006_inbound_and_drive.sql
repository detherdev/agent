-- Per-workspace hosted inbox for the inbound_email trigger.
-- Address shape: <inbox_address>@<INBOUND_EMAIL_DOMAIN> (e.g. wx-abc123@inbox.yourdomain.com).
-- Generated lazily on workspace bootstrap; nullable for already-existing rows.

alter table workspaces
  add column if not exists inbox_address text;

create unique index if not exists workspaces_inbox_address_uniq
  on workspaces(inbox_address) where inbox_address is not null;

-- New trigger kinds are validated in app code (Zod), not DB. The runs.status
-- check constraint is unaffected. No DB change needed for trigger_kind itself.
