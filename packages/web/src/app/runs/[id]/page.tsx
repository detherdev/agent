import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getOrCreateWorkspace } from "@/lib/auth";
import { getRun, getRunTurns, listPendingApprovals } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { StatusBadge } from "../StatusBadge";
import { Timeline } from "./Timeline";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");

  const { id } = await params;

  const [run, turns, pending] = await Promise.all([
    getRun(ctx, id).catch(() => null),
    getRunTurns(ctx, id).catch(() => []),
    listPendingApprovals(ctx),
  ]);

  if (!run) notFound();

  const dur =
    run.started_at && run.finished_at
      ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
      : null;

  return (
    <div className="min-h-screen">
      <AppHeader pendingCount={pending.length} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/runs" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← All runs
        </Link>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <StatusBadge status={run.status} />
              <h1 className="text-2xl font-semibold tracking-tight">Run</h1>
              {run.shadow_mode && (
                <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400">
                  shadow
                </span>
              )}
            </div>
            <div className="mt-2 text-sm text-neutral-500">
              {run.trigger_kind} • started {formatTime(run.started_at ?? run.created_at)}
              {dur != null && ` • ${dur}s`} • {run.step_count} steps • $
              {Number(run.cost_usd).toFixed(4)}
            </div>
          </div>
        </div>

        {run.error && (
          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
            <div className="text-xs uppercase tracking-wide text-red-300">Error</div>
            <div className="mt-1 font-mono">{run.error}</div>
          </div>
        )}

        <details className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <summary className="cursor-pointer text-sm font-medium text-neutral-300">
            Trigger input
          </summary>
          <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-neutral-950 p-3 text-xs text-neutral-400">
            {JSON.stringify(run.input, null, 2)}
          </pre>
        </details>

        {run.result != null && (
          <details
            open
            className="mt-3 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4"
          >
            <summary className="cursor-pointer text-sm font-medium text-emerald-200">
              Final summary
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-neutral-950 p-3 text-xs text-neutral-200">
              {typeof run.result === "string" ? run.result : JSON.stringify(run.result, null, 2)}
            </pre>
          </details>
        )}

        <h2 className="mt-10 mb-4 text-lg font-semibold tracking-tight">Timeline</h2>
        <Timeline turns={turns} />
      </main>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
