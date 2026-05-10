import { redirect } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/auth";
import { listRequiredProviders, listPendingApprovals } from "@/lib/api";
import { ConnectTiles } from "./ConnectTiles";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");
  const [providers, pending] = await Promise.all([
    listRequiredProviders(ctx),
    listPendingApprovals(ctx),
  ]);

  return (
    <div className="min-h-screen">
      <AppHeader pendingCount={pending.length} planTier={ctx.plan_tier} trialEndsAt={ctx.trial_ends_at} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Connected accounts</h1>
        <p className="mt-2 text-neutral-400">
          I'll only access what's needed to do the jobs you've added. You can disconnect any of
          these at any time.
        </p>
        <div className="mt-8">
          <ConnectTiles providers={providers} next={{ href: "/inbox", label: "Done" }} />
        </div>
      </main>
    </div>
  );
}
