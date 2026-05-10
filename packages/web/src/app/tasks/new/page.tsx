import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getOrCreateWorkspace } from "@/lib/auth";
import { listTaskTemplates, listPendingApprovals } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { StartForm } from "./StartForm";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");

  const [templates, pending] = await Promise.all([
    listTaskTemplates(ctx),
    listPendingApprovals(ctx),
  ]);
  const params = await searchParams;
  const selected = params.template
    ? templates.find((t) => t.slug === params.template)
    : null;

  return (
    <div className="min-h-screen">
      <AppHeader pendingCount={pending.length} planTier={ctx.plan_tier} trialEndsAt={ctx.trial_ends_at} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <Link href="/tasks" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← All tasks
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Start a task</h1>

        {!params.template ? (
          <>
            <p className="mt-2 text-sm text-neutral-400">Pick a template.</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
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
                  </Link>
                </li>
              ))}
            </ul>
            {templates.length === 0 && (
              <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/50 px-6 py-10 text-center text-neutral-500">
                No task templates available. Add a task definition under{" "}
                <code className="text-neutral-400">packs/&lt;vertical&gt;/tasks/</code>.
              </div>
            )}
          </>
        ) : !selected ? (
          notFound()
        ) : (
          <>
            <p className="mt-2 text-sm text-neutral-400">
              {selected.tagline ?? selected.description ?? ""}
            </p>

            <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
              <div className="mb-3 text-xs uppercase tracking-wide text-neutral-500">
                Phases ({selected.phase_count})
              </div>
              <ol className="space-y-2 text-sm text-neutral-300">
                {selected.phases.map((p, i) => (
                  <li key={i} className="flex items-baseline gap-2">
                    <span className="w-5 shrink-0 text-neutral-600">{i + 1}.</span>
                    <span className="flex-1">{p.name}</span>
                    {p.human_gate && (
                      <span className="text-xs text-amber-300">needs you</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-6">
              <StartForm slug={selected.slug} inputSchema={selected.input_schema} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
