-- Billing v1: tiered subscription model.
--
-- workspaces gains plan_tier + trial + Stripe linkage. New workspaces start
-- on 'trial' with a 14-day window; paid plans get their period boundaries
-- written by the Stripe webhook handler (next slice).
--
-- usage_counters is the per-period (workspace_id, period_start) rollup that
-- the run enqueue path checks before accepting new runs and that the worker
-- updates with realized cost when each run finishes.

alter table workspaces
  add column if not exists plan_tier text not null default 'trial'
    check (plan_tier in ('trial', 'starter', 'pro', 'enterprise')),
  add column if not exists trial_ends_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz;

create unique index if not exists workspaces_stripe_customer_idx
  on workspaces(stripe_customer_id) where stripe_customer_id is not null;

create table if not exists usage_counters (
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  run_count     int not null default 0,
  cost_usd      numeric(12, 6) not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, period_start)
);

create index if not exists usage_counters_lookup_idx
  on usage_counters(workspace_id, period_end desc);
