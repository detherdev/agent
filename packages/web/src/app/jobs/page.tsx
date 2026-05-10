import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateWorkspace } from "@/lib/auth";
import { listCatalog, listPendingApprovals } from "@/lib/api";
import { JobCard } from "./JobCard";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");

  const [jobs, pending] = await Promise.all([listCatalog(ctx), listPendingApprovals(ctx)]);

  return (
    <div className="min-h-screen">
      <AppHeader pendingCount={pending.length} planTier={ctx.plan_tier} trialEndsAt={ctx.trial_ends_at} />
      <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">What should I handle?</h1>
        <p className="mt-2 text-neutral-400">
          Pick a job below. Not sure where to start? Have me{" "}
          <Link href="/jobs/discover" className="text-emerald-400 underline">
            walk you through it
          </Link>
          .
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2" data-testid="job-list">
        {jobs.map((j) => (
          <li key={`${j.pack}/${j.slug}`}>
            <JobCard job={j} />
          </li>
        ))}
        <li>
          <Link
            href="/jobs/new"
            className="flex h-full flex-col justify-between rounded-xl border border-dashed border-neutral-700 bg-neutral-900/30 p-5 hover:bg-neutral-900/60"
          >
            <div>
              <h3 className="text-base font-semibold text-neutral-100">Tell me what you need</h3>
              <p className="mt-2 text-sm text-neutral-400">
                None of the templates fit? Describe what you'd like me to handle in plain English
                and I'll set it up with you.
              </p>
            </div>
            <span className="mt-5 inline-block rounded-md border border-neutral-700 px-3 py-2 text-center text-sm text-neutral-200 hover:border-neutral-500">
              Start a chat →
            </span>
          </Link>
        </li>
      </ul>
      </main>
    </div>
  );
}
