import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getOrCreateWorkspace } from "@/lib/auth";
import { getTask, listPendingApprovals } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

const TASK_STATUS_STYLE: Record<string, string> = {
  pending: "bg-neutral-800 text-neutral-300",
  running: "bg-blue-950 text-blue-200",
  awaiting_human: "bg-amber-950 text-amber-200",
  succeeded: "bg-emerald-950 text-emerald-200",
  failed: "bg-red-950 text-red-200",
  cancelled: "bg-neutral-800 text-neutral-400",
};

const PHASE_STATUS_STYLE: Record<string, string> = {
  pending: "border-neutral-700 text-neutral-400",
  ready: "border-blue-700 text-blue-200",
  running: "border-blue-500 text-blue-200",
  awaiting_human: "border-amber-500 text-amber-200",
  succeeded: "border-emerald-600 text-emerald-200",
  failed: "border-red-600 text-red-200",
  skipped: "border-neutral-800 text-neutral-500",
  cancelled: "border-neutral-800 text-neutral-500",
};

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");
  const { id } = await params;

  const [detail, pending] = await Promise.all([
    getTask(ctx, id).catch(() => null),
    listPendingApprovals(ctx),
  ]);
  if (!detail) notFound();

  const { task, phases } = detail;

  return (
    <div className="min-h-screen">
      <AppHeader pendingCount={pending.length} planTier={ctx.plan_tier} trialEndsAt={ctx.trial_ends_at} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/tasks" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← All tasks
        </Link>

        <div className="mt-4 flex items-start gap-3">
          <span
            className={
              "rounded-full px-2 py-0.5 text-xs font-medium " +
              (TASK_STATUS_STYLE[task.status] ?? "bg-neutral-800 text-neutral-300")
            }
          >
            {task.status}
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">{task.name}</h1>
        </div>

        {task.template_slug && (
          <div className="mt-1 text-xs text-neutral-500">
            template: <code className="text-neutral-400">{task.template_slug}</code>
          </div>
        )}

        {task.error && (
          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
            <div className="text-xs uppercase tracking-wide text-red-300">Error</div>
            <div className="mt-1 font-mono">{task.error}</div>
          </div>
        )}

        <details className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <summary className="cursor-pointer text-sm text-neutral-300">Task input</summary>
          <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-neutral-950 p-3 text-xs text-neutral-400">
            {JSON.stringify(task.input, null, 2)}
          </pre>
        </details>

        <h2 className="mt-10 mb-4 text-lg font-semibold tracking-tight">Phases</h2>
        <ol className="space-y-3">
          {phases.map((p) => (
            <li
              key={p.id}
              className={
                "rounded-xl border bg-neutral-900/50 p-4 " +
                (PHASE_STATUS_STYLE[p.status] ?? "border-neutral-800 text-neutral-400")
              }
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className="font-mono text-xs text-neutral-500">{p.order_idx + 1}.</span>
                  <span className="text-sm font-medium text-neutral-100">{p.name}</span>
                  {p.human_gate && (
                    <span className="text-xs text-amber-300">human gate</span>
                  )}
                </div>
                <span className="text-xs uppercase tracking-wide">{p.status}</span>
              </div>

              {p.human_instructions && p.status === "awaiting_human" && (
                <div className="mt-2 rounded-md bg-amber-950/30 p-3 text-sm text-amber-100">
                  {p.human_instructions}
                  <div className="mt-2">
                    <Link
                      href="/inbox"
                      className="text-xs text-amber-300 underline hover:text-amber-200"
                    >
                      Decide in your inbox →
                    </Link>
                  </div>
                </div>
              )}

              {p.run_id && (
                <div className="mt-2 text-xs text-neutral-500">
                  <Link
                    href={`/runs/${p.run_id}`}
                    className="text-neutral-400 hover:text-neutral-200"
                  >
                    Run inspector →
                  </Link>
                </div>
              )}

              {p.error && (
                <div className="mt-2 text-xs text-red-300">{p.error}</div>
              )}

              {p.output != null && p.status === "succeeded" && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300">
                    Output
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-neutral-950 p-3 text-xs text-neutral-400">
                    {typeof p.output === "string" ? p.output : JSON.stringify(p.output, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ol>

        {task.result != null && task.status === "succeeded" && (
          <details
            open
            className="mt-8 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4"
          >
            <summary className="cursor-pointer text-sm font-medium text-emerald-200">
              Final result
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-neutral-950 p-3 text-xs text-neutral-200">
              {JSON.stringify(task.result, null, 2)}
            </pre>
          </details>
        )}
      </main>
    </div>
  );
}
