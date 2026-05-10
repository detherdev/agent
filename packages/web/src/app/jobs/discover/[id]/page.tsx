import { redirect, notFound } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/auth";
import {
  getDiscoveryDraft,
  listPendingApprovals,
  extractChatMessages,
  type ChatMessage,
} from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { DiscoveryChat } from "./Chat";

export const dynamic = "force-dynamic";

export default async function DiscoverChatPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");
  const { id } = await params;

  const [draft, pending] = await Promise.all([
    getDiscoveryDraft(ctx, id).catch(() => null),
    listPendingApprovals(ctx),
  ]);
  if (!draft) notFound();

  let messages: ChatMessage[] = extractChatMessages(draft.messages);
  if (messages.length === 0) {
    messages = [
      {
        role: "assistant",
        text:
          "Hey — let me get to know your business so I can suggest the right things to start with. What does your company do, and roughly how many people?",
      },
    ];
  }

  return (
    <div className="min-h-screen">
      <AppHeader pendingCount={pending.length} planTier={ctx.plan_tier} trialEndsAt={ctx.trial_ends_at} />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Figure out what to automate</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Tell me about your business. After a few questions I'll suggest 3–6 templates that
            would fit, and you can install whatever looks right.
          </p>
        </div>

        <DiscoveryChat draftId={draft.id} initialMessages={messages} initialDraft={draft} />
      </main>
    </div>
  );
}
