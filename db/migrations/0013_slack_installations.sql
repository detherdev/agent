-- Slack interactive integration.
--
-- One Slack workspace ↔ one of our workspaces in v0; multi-tenant Slack-app
-- installs are out of scope. The bot token is stored here unencrypted for
-- v0; SOC2 prep migration adds pgcrypto.
--
-- approvals also gain Slack message coordinates so the same row can be
-- updated in place when the user clicks Approve / Reject in Slack (we
-- post a card, then `chat.update` it to "Approved by X").

create table if not exists slack_installations (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  slack_team_id   text not null,
  slack_enterprise_id text,
  bot_user_id     text not null,
  bot_token       text not null,                  -- xoxb-... (TODO: pgcrypto)
  authed_user_id  text not null,
  authed_user_scope text,
  scopes          text[] not null default '{}',
  default_channel_id text,                        -- where approvals get posted; null = DM the installer
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id),
  unique (slack_team_id)
);

alter table approvals
  add column if not exists slack_channel_id text,
  add column if not exists slack_message_ts text;
