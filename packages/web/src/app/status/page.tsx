import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateWorkspace } from "@/lib/auth";
import { getWorkspaceStats, getWorkflowStats, listPendingApprovals } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");

  const [ws, wfs, pending] = await Promise.all([
    getWorkspaceStats(ctx),
    getWorkflowStats(ctx),
    listPendingApprovals(ctx),
  ]);

  return (
    <div className="min-h-screen">
      <AppHeader pendingCount={pending.length} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Last 24 hours</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Runs" value={String(ws.runs_24h)} />
          <Stat label="Succeeded" value={String(ws.succeeded_24h)} accent="emerald" />
          <Stat
            label="Waiting on you"
            value={String(ws.awaiting_24h)}
            accent={ws.awaiting_24h > 0 ? "amber" : undefined}
          />
          <Stat label="Spend" value={`$${ws.cost_usd_24h.toFixed(2)}`} />
        </div>

        <div className="mt-10 mb-2 text-xs uppercase tracking-wide text-neutral-500">
          Last 30 days
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Runs" value={String(ws.total_runs_30d)} />
          <Stat
            label="Success rate"
            value={
              ws.total_runs_30d === 0
                ? "—"
                : `${Math.round((ws.succeeded_30d / ws.total_runs_30d) * 100)}%`
            }
            accent="emerald"
          />
          <Stat label="Failed" value={String(ws.failed_30d)} accent={ws.failed_30d > 0 ? "red" : undefined} />
          <Stat label="Spend" value={`$${ws.cost_usd_30d.toFixed(2)}`} />
        </div>

        <h2 className="mt-12 mb-4 text-lg font-semibold tracking-tight">Per workflow</h2>

        {wfs.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-6 py-12 text-center text-neutral-500">
            No workflows yet. <Link className="text-emerald-400" href="/jobs">Add one</Link>.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Workflow</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3 text-right">Runs (30d)</th>
                  <th className="px-4 py-3 text-right">Success</th>
                  <th className="px-4 py-3 text-right">Avg / p95</th>
                  <th className="px-4 py-3 text-right">Spend</th>
                  <th className="px-4 py-3 text-right">Last</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {wfs.map((w) => {
                  const rate =
                    w.runs_30d === 0 ? "—" : `${Math.round((w.succeeded_30d / w.runs_30d) * 100)}%`;
                  const avg = w.avg_duration_sec == null ? "—" : `${Math.round(w.avg_duration_sec)}s`;
                  const p95 = w.p95_duration_sec == null ? "—" : `${Math.round(w.p95_duration_sec)}s`;
                  return (
                    <tr key={w.id} className="hover:bg-neutral-900/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/runs?workflow_id=${w.id}`}
                          className="font-medium text-neutral-100 hover:text-emerald-400"
                        >
                          {w.name}
                        </Link>
                        {w.awaiting_approval > 0 && (
                          <span className="ml-2 rounded-full bg-amber-950 px-1.5 py-0.5 text-xs text-amber-200">
                            {w.awaiting_approval} waiting
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-400">{w.trigger_kind}</td>
                      <td className="px-4 py-3 text-right text-neutral-300">{w.runs_30d}</td>
                      <td className="px-4 py-3 text-right text-emerald-300">{rate}</td>
                      <td className="px-4 py-3 text-right text-neutral-400">
                        {avg} / {p95}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-400">
                        ${w.cost_usd_30d.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-500">
                        {w.last_run_at ? formatRelative(w.last_run_at) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "amber" | "red";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "amber"
      ? "text-amber-300"
      : accent === "red"
      ? "text-red-300"
      : "text-neutral-100";
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accentClass}`}>{value}</div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}
