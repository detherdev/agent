import { redirect } from "next/navigation";
import { getOrCreateWorkspace, type PlanTier } from "@/lib/auth";
import { UsageBars } from "./UsageBars";
import { PlanTable } from "./PlanTable";

export const dynamic = "force-dynamic";

const PLAN_DISPLAY: Record<PlanTier, { name: string; price: string; runs: string; spend: string; seats: string }> = {
  trial: { name: "Trial", price: "Free for 14 days", runs: "50 / mo", spend: "$5 / mo", seats: "1" },
  starter: { name: "Starter", price: "$99 / mo", runs: "200 / mo", spend: "$50 / mo", seats: "3" },
  pro: { name: "Pro", price: "$399 / mo", runs: "1,000 / mo", spend: "$200 / mo", seats: "10" },
  enterprise: { name: "Enterprise", price: "Custom", runs: "Unlimited", spend: "Custom", seats: "Unlimited" },
};

export default async function BillingPage() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");

  const plan = PLAN_DISPLAY[ctx.plan_tier];
  const trialDaysLeft = ctx.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(ctx.trial_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

  return (
    <div className="space-y-8">
      {/* Current plan */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">Current plan</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-2xl font-semibold text-neutral-100">{plan.name}</span>
              <span className="text-sm text-neutral-400">{plan.price}</span>
            </div>
            {ctx.plan_tier === "trial" && trialDaysLeft != null && (
              <div className="mt-2 text-sm">
                {trialDaysLeft > 0 ? (
                  <span className="text-amber-300">
                    {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left in your trial
                  </span>
                ) : (
                  <span className="text-red-300">Trial expired — pick a plan to keep running.</span>
                )}
              </div>
            )}
          </div>
          {ctx.plan_tier !== "enterprise" && (
            <button
              disabled
              title="Stripe checkout wires in the next slice"
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white opacity-60"
            >
              Upgrade plan
            </button>
          )}
        </div>
      </section>

      {/* Usage */}
      {ctx.usage && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xs uppercase tracking-wide text-neutral-500">Usage this period</h2>
            <span className="text-xs text-neutral-500">
              Resets {new Date(ctx.usage.period_end).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <UsageBars usage={ctx.usage} />
        </section>
      )}

      {/* Plan comparison */}
      <section>
        <h2 className="mb-3 text-xs uppercase tracking-wide text-neutral-500">All plans</h2>
        <PlanTable currentTier={ctx.plan_tier} />
      </section>

      {/* Billing portal placeholder */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <div className="text-sm font-medium text-neutral-100">Billing history & payment method</div>
        <p className="mt-1 text-sm text-neutral-400">
          When Stripe is wired (next slice), the customer portal launches here — receipts,
          card on file, downgrade / cancel.
        </p>
        <button
          disabled
          className="mt-4 rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-400 opacity-60"
        >
          Open billing portal
        </button>
      </section>
    </div>
  );
}
