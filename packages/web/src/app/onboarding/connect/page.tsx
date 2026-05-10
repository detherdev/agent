import { redirect } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/auth";
import { listRequiredProviders } from "@/lib/api";
import { Steps } from "../Steps";
import { ConnectTiles } from "../../connect/ConnectTiles";

export const dynamic = "force-dynamic";

export default async function OnboardingConnectPage() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");
  if (ctx.onboarding_step < 1) redirect("/onboarding");
  if (ctx.onboarding_step >= 2) redirect("/onboarding/done");

  const providers = await listRequiredProviders(ctx);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Steps current={2} />

      <h1 className="text-3xl font-semibold tracking-tight">Connect what I'll need</h1>
      <p className="mt-2 text-neutral-400">
        I'll only access what's needed for the jobs you picked. You'll see exactly what I'm doing
        with these accounts in your inbox — and you can disconnect anytime.
      </p>

      {providers.length === 0 ? (
        <div className="mt-8 rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 text-sm text-neutral-400">
          No accounts to connect for the jobs you picked.
        </div>
      ) : (
        <div className="mt-8">
          <ConnectTiles
            providers={providers}
            next={{ href: "/onboarding/done", label: "All connected — continue" }}
          />
        </div>
      )}
    </main>
  );
}
