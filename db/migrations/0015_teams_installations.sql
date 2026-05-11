-- Microsoft Teams interactive bot.
--
-- Mirrors slack_installations: one Teams tenant ↔ one of our workspaces in
-- v1. The bot is registered via Azure Bot Service (Bot Framework); we hold
-- the Microsoft App ID + secret in env (single bot, multi-tenant). Per-
-- workspace rows hold the Teams tenant_id + service URL we got from the
-- bot's first conversation event, which we need to post Adaptive Cards
-- back into the channel.
--
-- approvals gain teams_* coordinates so the same approval can be updated
-- in place when the user clicks Approve / Reject in Teams.

create table if not exists teams_installations (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  tenant_id       text not null,                 -- Microsoft Entra tenant
  service_url     text,                          -- per-tenant Bot Framework URL, filled in on bot's first activity
  conversation_id text,                          -- channel where approval cards land; filled in on first activity
  channel_id      text,                          -- Teams channel id (may equal conversation_id)
  bot_id          text not null,                 -- our bot's MS App ID (for outbound auth)
  installed_by    text,                          -- AAD user id who first messaged the bot
  status          text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id),
  unique (tenant_id)
);

alter table approvals
  add column if not exists teams_conversation_id text,
  add column if not exists teams_activity_id text;
