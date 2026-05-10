import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateWorkspace } from "@/lib/auth";
import { listRuns, listPendingApprovals } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { StatusBadge } from "./StatusBadge";

export const dynamic = "force-dynamic";

interface SearchParams {
  workflow_id?: string;
  status?: string;
}

export default async function RunsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");

  const params = await searchParams;
  const [runs, pending] = await Promise.all([
    listRuns(ctx, { workflow_id: params.workflow_id, status: params.status, limit: 100 }),
    listPendingApprovals(ctx),
  ]);

  return (
    <div className="min-h-screen">
      <AppHeader pendingCount={pending.length} planTier={ctx.plan_tier} trialEndsAt={ctx.trial_ends_at} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Recent runs</h1>
          <span className="text-sm text-neutral-500">{runs.length} shown</span>
        </div>

        <div className="mb-6 flex flex-wrap gap-2 text-xs">
          <FilterPill label="All" href="/runs" active={!params.status} />
          <FilterPill label="Succeeded" href="/runs?status=succeeded" active={params.status === "succeeded"} />
          <FilterPill label="Failed" href="/runs?status=failed" active={params.status === "failed"} />
          <FilterPill
            label="Awaiting approval"
            href="/runs?status=awaiting_approval"
            active={params.status === "awaiting_approval"}
          />
          <FilterPill label="Running" href="/runs?status=running" active={params.status === "running"} />
        </div>

        {runs.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-6 py-12 text-center text-neutral-500">
            No runs match this filter.
          </div>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => {
              const dur =
                r.started_at && r.finished_at
                  ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)
                  : null;
              return (
                <li key={r.id}>
                  <Link
                    href={`/runs/${r.id}`}
                    className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3 hover:bg-neutral-900"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <StatusBadge status={r.status} />
                        <span className="truncate text-sm font-medium text-neutral-100">{r.workflow_name}</span>
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {r.trigger_kind} • {formatTime(r.created_at)}
                        {dur != null && ` • ${dur}s`}
                        {r.step_count > 0 && ` • ${r.step_count} steps`}
                      </div>
                    </div>
                    <div className="ml-4 shrink-0 text-right text-xs text-neutral-500">
                      ${Number(r.cost_usd).toFixed(4)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function FilterPill({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={
        "rounded-full px-3 py-1 " +
        (active
          ? "bg-neutral-100 text-neutral-950"
          : "border border-neutral-800 text-neutral-400 hover:bg-neutral-900")
      }
    >
      {label}
    </Link>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
