import { redirect } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/auth";
import { listPendingApprovals } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { SettingsNav } from "./SettingsNav";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");
  const pending = await listPendingApprovals(ctx).catch(() => []);

  return (
    <div className="min-h-screen">
      <AppHeader pendingCount={pending.length} planTier={ctx.plan_tier} trialEndsAt={ctx.trial_ends_at} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
        <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
          <SettingsNav />
          <div>{children}</div>
        </div>
      </main>
    </div>
  );
}
