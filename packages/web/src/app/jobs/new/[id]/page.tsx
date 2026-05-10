import { redirect, notFound } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/auth";
import { getSpecDraft, listPendingApprovals, extractChatMessages, type ChatMessage } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { Chat } from "./Chat";

export const dynamic = "force-dynamic";

export default async function SetupChatPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");
  const { id } = await params;

  const [draft, pending] = await Promise.all([
    getSpecDraft(ctx, id).catch(() => null),
    listPendingApprovals(ctx),
  ]);
  if (!draft) notFound();

  // Prepend a greeting so the user sees something even on a fresh draft.
  let messages: ChatMessage[] = extractChatMessages(draft.messages);
  if (messages.length === 0) {
    messages = [
      {
        role: "assistant",
        text:
          "Hey — what would you like me to handle for you? Give me a concrete recent example if you can: who does this work today, and what triggers it.",
      },
    ];
  }

  return (
    <div className="min-h-screen">
      <AppHeader pendingCount={pending.length} planTier={ctx.plan_tier} trialEndsAt={ctx.trial_ends_at} />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Set up a custom job</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Describe what you'd like me to handle in plain English. I'll ask a few questions and
            propose a setup for you to review.
          </p>
        </div>

        <Chat draftId={draft.id} initialMessages={messages} initialDraft={draft} />
      </main>
    </div>
  );
}
