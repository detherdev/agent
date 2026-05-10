import { z } from "zod";

export const PlanTier = z.enum(["trial", "starter", "pro", "enterprise"]);
export type PlanTier = z.infer<typeof PlanTier>;

/**
 * Per-period limits per plan tier. The "period" is the calendar month for
 * trial workspaces, and the Stripe billing period (start/end on workspaces
 * row) for paid plans.
 *
 * `runs_per_period` is the count cap; `spend_usd_per_period` is the
 * Anthropic-spend cap. Hitting either blocks new run enqueues until the
 * next period or a plan upgrade.
 *
 * `workflows_max` and `member_seats` are enforced separately on the
 * install / invite paths (next slice).
 */
export interface PlanLimits {
  runs_per_period: number;
  spend_usd_per_period: number;
  workflows_max: number;
  member_seats: number;
  display_name: string;
  monthly_price_usd: number | null;  // null = custom (enterprise) or free (trial)
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  trial: {
    runs_per_period: 50,
    spend_usd_per_period: 5,
    workflows_max: 3,
    member_seats: 1,
    display_name: "Trial",
    monthly_price_usd: 0,
  },
  starter: {
    runs_per_period: 200,
    spend_usd_per_period: 50,
    workflows_max: 3,
    member_seats: 3,
    display_name: "Starter",
    monthly_price_usd: 99,
  },
  pro: {
    runs_per_period: 1_000,
    spend_usd_per_period: 200,
    workflows_max: 999,
    member_seats: 10,
    display_name: "Pro",
    monthly_price_usd: 399,
  },
  enterprise: {
    runs_per_period: 999_999,
    spend_usd_per_period: 99_999,
    workflows_max: 999,
    member_seats: 999,
    display_name: "Enterprise",
    monthly_price_usd: null,
  },
};

export function limitsFor(tier: PlanTier): PlanLimits {
  return PLAN_LIMITS[tier];
}

export const TRIAL_DURATION_DAYS = 14;
