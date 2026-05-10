import { redirect } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/auth";
import { listCatalog } from "@/lib/api";
import { Steps } from "./Steps";
import { JobCard } from "../jobs/JobCard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");
  if (ctx.onboarding_step >= 1) redirect("/onboarding/connect");

  const jobs = await listCatalog(ctx);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Steps current={1} />

      <h1 className="text-3xl font-semibold tracking-tight">
        Hi {ctx.email.split("@")[0]} — what should I handle for you?
      </h1>
      <p className="mt-2 text-neutral-400">
        Pick one to start. You can always add more later. I'll only do work you've reviewed first.
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2" data-testid="job-list">
        {jobs.map((j) => (
          <li key={`${j.pack}/${j.slug}`}>
            <JobCard job={j} nextHref="/onboarding/connect" />
          </li>
        ))}
      </ul>
    </main>
  );
}
