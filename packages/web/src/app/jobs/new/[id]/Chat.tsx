"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ChatMessage, SpecDraft } from "@/lib/api";
import { sendMessage } from "./actions";

export function Chat({
  draftId,
  initialMessages,
  initialDraft,
}: {
  draftId: string;
  initialMessages: ChatMessage[];
  initialDraft: SpecDraft;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState<SpecDraft>(initialDraft);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
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
        const res = await sendMessage(draftId, text);
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

  const hasSpec = draft.proposed_spec != null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Chat column */}
      <section className="flex h-[70vh] flex-col rounded-xl border border-neutral-800 bg-neutral-900/50">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.text} />
          ))}
          {pending && (
            <div className="text-xs text-neutral-500">Setup is thinking…</div>
          )}
        </div>
        <div className="border-t border-neutral-800 p-3">
          {error && <div className="mb-2 text-xs text-red-300">{error}</div>}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Tell me what you want me to handle…  (Enter sends, Shift+Enter for a new line)"
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

      {/* Spec status column */}
      <aside className="space-y-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Spec status</div>
          <div className="mt-2 text-sm">
            {!hasSpec ? (
              <span className="text-neutral-400">Not proposed yet — keep chatting.</span>
            ) : (
              <span className="text-emerald-300">Ready to review.</span>
            )}
          </div>
          {hasSpec && draft.proposed_spec && (
            <>
              <div className="mt-3 text-sm font-medium text-neutral-100">
                {String((draft.proposed_spec as { name?: string }).name ?? "Untitled")}
              </div>
              <SpecPeek spec={draft.proposed_spec as Record<string, unknown>} />
              <button
                onClick={() => router.push(`/jobs/new/${draftId}/review`)}
                className="mt-4 w-full rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-white"
              >
                Review and install →
              </button>
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

function SpecPeek({ spec }: { spec: Record<string, unknown> }) {
  const trigger = (spec.trigger_kind as string) ?? "—";
  const tc = (spec.tool_config as { connectors?: Array<{ slug: string }>; builtins?: string[] }) ?? {};
  const connectors = (tc.connectors ?? []).map((c) => c.slug);
  const builtins = tc.builtins ?? [];
  const guardrails = (spec.guardrails as { approvals?: unknown[] }) ?? {};
  const approvals = guardrails.approvals?.length ?? 0;
  const testCases = Array.isArray(spec.test_cases) ? spec.test_cases.length : 0;

  return (
    <ul className="mt-3 space-y-1.5 text-xs text-neutral-400">
      <li>
        <span className="text-neutral-500">Trigger:</span>{" "}
        <span className="text-neutral-300">{trigger}</span>
      </li>
      <li>
        <span className="text-neutral-500">Connects:</span>{" "}
        <span className="text-neutral-300">{[...connectors, ...builtins].join(", ") || "—"}</span>
      </li>
      <li>
        <span className="text-neutral-500">Asks first:</span>{" "}
        <span className="text-neutral-300">{approvals} situation{approvals === 1 ? "" : "s"}</span>
      </li>
      <li>
        <span className="text-neutral-500">Test cases:</span>{" "}
        <span className="text-neutral-300">{testCases}</span>
      </li>
    </ul>
  );
}
