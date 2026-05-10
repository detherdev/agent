"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import type { ChatMessage, DiscoveryDraft, DiscoveryPick } from "@/lib/api";
import { sendDiscoveryMessage } from "./actions";

export function DiscoveryChat({
  draftId,
  initialMessages,
  initialDraft,
}: {
  draftId: string;
  initialMessages: ChatMessage[];
  initialDraft: DiscoveryDraft;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState<DiscoveryDraft>(initialDraft);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  const send = () => {
    const text = input.trim();
    if (!text || pending) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);

    startTransition(async () => {
      try {
        const res = await sendDiscoveryMessage(draftId, text);
        setMessages((m) => [...m, { role: "assistant", text: res.assistant_message }]);
        setDraft(res.draft);
      } catch (err) {
        setError((err as Error).message);
        setMessages((m) => m.slice(0, -1));
        setInput(text);
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const picks = draft.recommendations?.picks ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="flex h-[70vh] flex-col rounded-xl border border-neutral-800 bg-neutral-900/50">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.text} />
          ))}
          {pending && <div className="text-xs text-neutral-500">Thinking…</div>}
        </div>
        <div className="border-t border-neutral-800 p-3">
          {error && <div className="mb-2 text-xs text-red-300">{error}</div>}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Tell me about your business…  (Enter sends, Shift+Enter for a new line)"
              rows={2}
              disabled={pending}
              className="flex-1 resize-none rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={pending || !input.trim()}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {pending ? "…" : "Send"}
            </button>
          </div>
        </div>
      </section>

      <aside className="space-y-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Recommendations</div>
          {picks.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">
              Keep chatting — I'll pick a starter set once I understand your situation.
            </p>
          ) : (
            <>
              {draft.recommendations?.summary && (
                <p className="mt-2 text-sm text-neutral-300">{draft.recommendations.summary}</p>
              )}
              <ul className="mt-4 space-y-3">
                {picks.map((p, i) => (
                  <li key={i}>
                    <PickCard pick={p} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <Link
          href="/jobs"
          className="block rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-sm text-neutral-400 hover:bg-neutral-900"
        >
          ← Back to job picker
        </Link>
      </aside>
    </div>
  );
}

function PickCard({ pick }: { pick: DiscoveryPick }) {
  // Workflow picks: /jobs (pack listing) lets the user click Install.
  // Task picks: /tasks/new?template=... opens the start-task form.
  const href =
    pick.kind === "task"
      ? `/tasks/new?template=${encodeURIComponent(pick.slug)}`
      : `/jobs`;

  return (
    <Link
      href={href}
      className="block rounded-md border border-neutral-800 bg-neutral-950 p-3 hover:border-neutral-600"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-neutral-100">{pick.slug}</span>
        <span
          className={
            "rounded-full px-2 py-0.5 text-xs " +
            (pick.kind === "task"
              ? "bg-amber-950 text-amber-200"
              : "bg-blue-950 text-blue-200")
          }
        >
          {pick.kind}
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-400">{pick.why}</p>
    </Link>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm " +
          (isUser
            ? "bg-emerald-600 text-white"
            : "border border-neutral-800 bg-neutral-950 text-neutral-200")
        }
      >
        {text}
      </div>
    </div>
  );
}
