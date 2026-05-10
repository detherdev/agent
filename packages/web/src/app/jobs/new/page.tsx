import { redirect } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/auth";
import { startSpecDraft } from "@/lib/api";

export const dynamic = "force-dynamic";

// Bootstrap a fresh draft and bounce to it. Drafts are durable, so a
// reload here is fine — each visit just creates a new draft.
export default async function NewJobBootstrap() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");

  const draft = await startSpecDraft(ctx);
  redirect(`/jobs/new/${draft.id}`);
}
