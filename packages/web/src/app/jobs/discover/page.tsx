import { redirect } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/auth";
import { startDiscoveryDraft } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DiscoverBootstrap() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");
  const draft = await startDiscoveryDraft(ctx);
  redirect(`/jobs/discover/${draft.id}`);
}
