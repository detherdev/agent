-- Marketing-site lead capture. Pre-signup demo requests, sales inquiries,
-- waitlist signups all land here. The /demo form posts to /v1/leads which
-- writes one row and (optionally) pings a Slack incoming webhook so the
-- founder gets a notification.
--
-- No FK to workspaces / users — these are people who haven't signed up yet.

create table if not exists leads (
  id          uuid primary key default uuid_generate_v4(),
  email       text not null,
  name        text,
  company     text,
  size        text,                          -- e.g. "1-5", "6-20", "21-50", "50+"
  vertical    text,                          -- bookkeeping / recruiting / agency / other
  message     text,
  source      text,                          -- "demo_form", "waitlist", "vs_zapier", etc.
  referrer    text,
  utm_source  text,
  utm_medium  text,
  utm_campaign text,
  status      text not null default 'new' check (status in ('new','contacted','qualified','closed_won','closed_lost')),
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists leads_status_created_idx on leads(status, created_at desc);
create index if not exists leads_email_idx on leads(email);
