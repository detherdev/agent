import type { PlanTier } from "@/lib/auth";

const PLANS = [
  { tier: "trial" as const, name: "Trial", price: "Free", runs: "50", spend: "$5", seats: "1", workflows: "3", highlight: false },
  { tier: "starter" as const, name: "Starter", price: "$99 / mo", runs: "200", spend: "$50", seats: "3", workflows: "3", highlight: false },
  { tier: "pro" as const, name: "Pro", price: "$399 / mo", runs: "1,000", spend: "$200", seats: "10", workflows: "Unlimited", highlight: true },
  { tier: "enterprise" as const, name: "Enterprise", price: "Custom", runs: "Unlimited", spend: "Custom", seats: "Unlimited", workflows: "Unlimited", highlight: false },
];

export function PlanTable({ currentTier }: { currentTier: PlanTier }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-900/50 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3" />
            {PLANS.map((p) => (
              <th
                key={p.tier}
                className={
                  "px-4 py-3 " + (p.tier === currentTier ? "text-emerald-300" : "text-neutral-300")
                }
              >
                {p.name}
                {p.tier === currentTier && (
                  <span className="ml-1.5 rounded-full bg-emerald-950 px-1.5 py-0.5 text-[10px] text-emerald-200">
                    you
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-900">
          <Row label="Monthly price" values={PLANS.map((p) => p.price)} />
          <Row label="Runs / month" values={PLANS.map((p) => p.runs)} />
          <Row label="Anthropic spend included" values={PLANS.map((p) => p.spend)} />
          <Row label="Workflows" values={PLANS.map((p) => p.workflows)} />
          <Row label="Team seats" values={PLANS.map((p) => p.seats)} />
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <td className="px-4 py-3 text-neutral-500">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-4 py-3 text-neutral-200">
          {v}
        </td>
      ))}
    </tr>
  );
}
