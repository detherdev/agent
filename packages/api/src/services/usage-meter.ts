import { query, limitsFor, PlanTier, type PlanLimits } from "runtime";

export interface WorkspacePlanState {
  plan_tier: PlanTier;
  trial_ends_at: Date | null;
  current_period_start: Date | null;
  current_period_end: Date | null;
}

export interface PeriodWindow {
  start: Date;
  end: Date;
}

export async function loadWorkspacePlan(workspaceId: string): Promise<WorkspacePlanState | null> {
  const r = await query<WorkspacePlanState>(
    `select plan_tier, trial_ends_at, current_period_start, current_period_end
       from workspaces where id = $1`,
    [workspaceId],
  );
  return r.rows[0] ?? null;
}

/**
 * Period window for usage counters.
 *
 * Paid plans use the Stripe-driven current_period_start/end. Trial workspaces
 * (or any workspace with null period) use the calendar month, which keeps the
 * counter table sparse during trial and resets cleanly the day someone upgrades.
 */
export function currentPeriod(plan: WorkspacePlanState, now: Date = new Date()): PeriodWindow {
  if (plan.current_period_start && plan.current_period_end) {
    return { start: plan.current_period_start, end: plan.current_period_end };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export interface UsageSnapshot {
  runs_used: number;
  runs_cap: number;
  cost_used: number;
  cost_cap: number;
  period_start: Date;
  period_end: Date;
  plan_tier: PlanTier;
  trial_ends_at: Date | null;
}

export interface CheckResult {
  ok: boolean;
  reason?: "workspace_not_found" | "trial_expired" | "runs_cap_reached" | "spend_cap_reached";
  usage?: UsageSnapshot;
}

/**
 * Block-or-allow gate called from every run-enqueue site. Cheap (1 SELECT
 * for plan + 1 SELECT for counter); call freely.
 */
export async function checkPlanLimits(workspaceId: string): Promise<CheckResult> {
  const plan = await loadWorkspacePlan(workspaceId);
  if (!plan) return { ok: false, reason: "workspace_not_found" };

  const limits = limitsFor(plan.plan_tier);
  const period = currentPeriod(plan);

  // Trial expiration check before the usage read so we don't even
  // bother computing usage for a workspace that's already locked.
  if (plan.plan_tier === "trial" && plan.trial_ends_at && plan.trial_ends_at < new Date()) {
    return {
      ok: false,
      reason: "trial_expired",
      usage: emptyUsage(plan.plan_tier, limits, period, plan.trial_ends_at),
    };
  }

  const r = await query<{ run_count: string; cost_usd: string }>(
    `select run_count, cost_usd from usage_counters
       where workspace_id = $1 and period_start = $2`,
    [workspaceId, period.start],
  );
  const usage = r.rows[0] ?? { run_count: "0", cost_usd: "0" };
  const runs_used = Number(usage.run_count);
  const cost_used = Number(usage.cost_usd);

  const snap: UsageSnapshot = {
    runs_used,
    runs_cap: limits.runs_per_period,
    cost_used,
    cost_cap: limits.spend_usd_per_period,
    period_start: period.start,
    period_end: period.end,
    plan_tier: plan.plan_tier,
    trial_ends_at: plan.trial_ends_at,
  };

  if (runs_used >= limits.runs_per_period) {
    return { ok: false, reason: "runs_cap_reached", usage: snap };
  }
  if (cost_used >= limits.spend_usd_per_period) {
    return { ok: false, reason: "spend_cap_reached", usage: snap };
  }
  return { ok: true, usage: snap };
}

export async function loadUsageSnapshot(workspaceId: string): Promise<UsageSnapshot | null> {
  const plan = await loadWorkspacePlan(workspaceId);
  if (!plan) return null;
  const limits = limitsFor(plan.plan_tier);
  const period = currentPeriod(plan);
  const r = await query<{ run_count: string; cost_usd: string }>(
    `select run_count, cost_usd from usage_counters
       where workspace_id = $1 and period_start = $2`,
    [workspaceId, period.start],
  );
  const usage = r.rows[0] ?? { run_count: "0", cost_usd: "0" };
  return {
    runs_used: Number(usage.run_count),
    runs_cap: limits.runs_per_period,
    cost_used: Number(usage.cost_usd),
    cost_cap: limits.spend_usd_per_period,
    period_start: period.start,
    period_end: period.end,
    plan_tier: plan.plan_tier,
    trial_ends_at: plan.trial_ends_at,
  };
}

function emptyUsage(
  tier: PlanTier,
  limits: PlanLimits,
  period: PeriodWindow,
  trialEnds: Date | null,
): UsageSnapshot {
  return {
    runs_used: 0,
    runs_cap: limits.runs_per_period,
    cost_used: 0,
    cost_cap: limits.spend_usd_per_period,
    period_start: period.start,
    period_end: period.end,
    plan_tier: tier,
    trial_ends_at: trialEnds,
  };
}

export async function incrementRunCount(workspaceId: string): Promise<void> {
  const plan = await loadWorkspacePlan(workspaceId);
  if (!plan) return;
  const period = currentPeriod(plan);
  await query(
    `insert into usage_counters (workspace_id, period_start, period_end, run_count, cost_usd)
       values ($1, $2, $3, 1, 0)
     on conflict (workspace_id, period_start)
       do update set run_count = usage_counters.run_count + 1, updated_at = now()`,
    [workspaceId, period.start, period.end],
  );
}

export async function incrementCost(workspaceId: string, costUsd: number): Promise<void> {
  if (costUsd <= 0) return;
  const plan = await loadWorkspacePlan(workspaceId);
  if (!plan) return;
  const period = currentPeriod(plan);
  await query(
    `insert into usage_counters (workspace_id, period_start, period_end, run_count, cost_usd)
       values ($1, $2, $3, 0, $4)
     on conflict (workspace_id, period_start)
       do update set cost_usd = usage_counters.cost_usd + excluded.cost_usd, updated_at = now()`,
    [workspaceId, period.start, period.end, costUsd],
  );
}
