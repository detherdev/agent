import { redirect } from "next/navigation";
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
      <AppHeader pendingCount={pending.length} />
      <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">What should I handle?</h1>
        <p className="mt-2 text-neutral-400">
          Pick a job. I'll walk you through connecting your accounts, then start handling it on your
          schedule. You stay in control of anything that matters.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-6 py-16 text-center text-neutral-500">
          No jobs available. (Add a pack under <code className="text-neutral-400">packs/</code>.)
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="job-list">
          {jobs.map((j) => (
            <li key={`${j.pack}/${j.slug}`}>
              <JobCard job={j} />
            </li>
          ))}
        </ul>
      )}
      </main>
    </div>
  );
}
