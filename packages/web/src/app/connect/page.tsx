import { redirect } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/auth";
import {
  listRequiredProviders,
  listPendingApprovals,
  getSlackInstallStatus,
  getTeamsInstallStatus,
} from "@/lib/api";
import { ConnectTiles } from "./ConnectTiles";
import { SlackApprovalsTile } from "./SlackApprovalsTile";
import { TeamsApprovalsTile } from "./TeamsApprovalsTile";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ slack?: string; reason?: string }>;
}) {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");
  const [providers, pending, slack, teams] = await Promise.all([
    listRequiredProviders(ctx),
    listPendingApprovals(ctx),
    getSlackInstallStatus(ctx),
    getTeamsInstallStatus(ctx),
  ]);
  const params = await searchParams;

  return (
    <div className="min-h-screen">
      <AppHeader pendingCount={pending.length} planTier={ctx.plan_tier} trialEndsAt={ctx.trial_ends_at} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Connected accounts</h1>
        <p className="mt-2 text-neutral-400">
          I'll only access what's needed to do the jobs you've added. You can disconnect any of
          these at any time.
        </p>

        {params.slack === "installed" && (
          <div className="mt-4 rounded-md border border-emerald-900/50 bg-emerald-950/30 p-3 text-sm text-emerald-300">
            Slack bot installed. Approvals will start landing in your channel.
          </div>
        )}
        {params.slack === "error" && (
          <div className="mt-4 rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
            Slack install failed{params.reason ? `: ${params.reason}` : ""}. Try again.
          </div>
        )}

        <div className="mt-8">
          <ConnectTiles providers={providers} next={{ href: "/inbox", label: "Done" }} />
        </div>

        <h2 className="mt-12 text-lg font-semibold tracking-tight">Approvals & notifications</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Decide right where your team already lives.
        </p>
        <ul className="mt-4 space-y-3">
          <SlackApprovalsTile installed={slack.installed} token={ctx.token} apiUrl={API_URL} />
          <TeamsApprovalsTile status={teams} token={ctx.token} apiUrl={API_URL} />
        </ul>
      </main>
    </div>
  );
}
