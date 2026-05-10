import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/auth";
import { setOnboardingStep } from "@/lib/api";
import { Steps } from "../Steps";

export const dynamic = "force-dynamic";

export default async function OnboardingDonePage() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");

  if (ctx.onboarding_step < 3) {
    await setOnboardingStep(ctx, 3);
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Steps current={3} />

      <h1 className="text-3xl font-semibold tracking-tight">All set.</h1>
      <p className="mt-3 text-neutral-400">
        I'll start handling things on the schedule each job specifies. Anything I'm not sure about
        will land in your inbox for you to OK. The first week, I'll be cautious — that's normal.
      </p>

      <div className="mt-8 grid gap-3">
        <Link
          href="/inbox"
          className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-5 py-4 hover:bg-neutral-900"
        >
          <div className="text-base font-medium">Go to my inbox</div>
          <div className="text-sm text-neutral-500">See what I'm working on.</div>
        </Link>
        <Link
          href="/jobs"
          className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-5 py-4 hover:bg-neutral-900"
        >
          <div className="text-base font-medium">Add another job</div>
          <div className="text-sm text-neutral-500">More things I can take off your plate.</div>
        </Link>
      </div>
    </main>
  );
}
