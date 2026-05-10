import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateWorkspace } from "@/lib/auth";
import { listTasks, listTaskTemplates, listPendingApprovals } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-neutral-800 text-neutral-300",
  running: "bg-blue-950 text-blue-200",
  awaiting_human: "bg-amber-950 text-amber-200",
  succeeded: "bg-emerald-950 text-emerald-200",
  failed: "bg-red-950 text-red-200",
  cancelled: "bg-neutral-800 text-neutral-400",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  awaiting_human: "Needs you",
  succeeded: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export default async function TasksPage() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");

  const [tasks, templates, pending] = await Promise.all([
    listTasks(ctx),
    listTaskTemplates(ctx),
    listPendingApprovals(ctx),
  ]);

  return (
    <div className="min-h-screen">
      <AppHeader pendingCount={pending.length} />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <Link
            href="/tasks/new"
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Start a task
          </Link>
        </div>
        <p className="text-sm text-neutral-500">
          Multi-phase work that spans more than one run — month-end close, weekly AR review,
          quarterly tax prep. Phases run in order, pause for human review when needed, and pick
          back up automatically.
        </p>

        <h2 className="mt-10 mb-3 text-xs uppercase tracking-wide text-neutral-500">
          Recent
        </h2>
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-6 py-10 text-center text-neutral-500">
            No tasks yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tasks/${t.id}`}
                  className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3 hover:bg-neutral-900"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (STATUS_STYLE[t.status] ?? "bg-neutral-800 text-neutral-300")
                      }
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    <span className="text-sm font-medium text-neutral-100">{t.name}</span>
                  </div>
                  <span className="text-xs text-neutral-500">
                    {new Date(t.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {templates.length > 0 && (
          <>
            <h2 className="mt-10 mb-3 text-xs uppercase tracking-wide text-neutral-500">
              Available templates
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {templates.map((tpl) => (
                <li key={tpl.slug}>
                  <Link
                    href={`/tasks/new?template=${encodeURIComponent(tpl.slug)}`}
                    className="block h-full rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 hover:bg-neutral-900"
                  >
                    <div className="text-sm font-semibold text-neutral-100">{tpl.name}</div>
                    {tpl.tagline && (
                      <div className="mt-1 text-xs text-neutral-400">{tpl.tagline}</div>
                    )}
                    <div className="mt-3 text-xs text-neutral-500">
                      {tpl.phase_count} phase{tpl.phase_count === 1 ? "" : "s"} •{" "}
                      {tpl.phases.some((p) => p.human_gate) ? "with human review" : "fully automated"}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
