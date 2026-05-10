import type { UsageSnapshot } from "@/lib/auth";

export function UsageBars({ usage }: { usage: UsageSnapshot }) {
  const runsPct = clamp((usage.runs_used / usage.runs_cap) * 100);
  const costPct = clamp((usage.cost_used / usage.cost_cap) * 100);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card
        label="Workflow runs"
        used={`${usage.runs_used.toLocaleString()}`}
        cap={`${usage.runs_cap.toLocaleString()}`}
        pct={runsPct}
      />
      <Card
        label="Anthropic spend"
        used={`$${usage.cost_used.toFixed(2)}`}
        cap={`$${usage.cost_cap.toFixed(2)}`}
        pct={costPct}
      />
    </div>
  );
}

function Card({
  label,
  used,
  cap,
  pct,
}: {
  label: string;
  used: string;
  cap: string;
  pct: number;
}) {
  const tone =
    pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-neutral-100">{used}</span>
        <span className="text-sm text-neutral-500">of {cap}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-800">
        <div className={`${tone} h-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-neutral-500">{pct.toFixed(0)}%</div>
    </div>
  );
}

function clamp(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
