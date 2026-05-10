-- Per-workspace OAuth connections. We delegate the OAuth dance and token
-- refresh to Nango; we just remember which provider this workspace has
-- connected and Nango's connection_id for it.

create table if not exists connections (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  provider        text not null,                   -- e.g. 'gmail', 'quickbooks', 'stripe'
  nango_connection_id text not null,
  display_name    text,
  metadata        jsonb not null default '{}',
  status          text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, provider)
);

create index if not exists connections_workspace_idx on connections(workspace_id) where status = 'active';
