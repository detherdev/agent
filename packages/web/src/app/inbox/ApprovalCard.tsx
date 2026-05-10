"use client";

import { useState, useTransition } from "react";
import { approve, reject } from "./actions";
import type { PendingApproval } from "@/lib/api";

export function ApprovalCard({ approval }: { approval: PendingApproval }) {
  const [pending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const summary = describeAction(approval.pending_tool_name, approval.pending_tool_input);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-200">{summary}</p>
          <p className="mt-1 text-xs text-neutral-500">{approval.reason}</p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-950 px-2 py-0.5 text-xs text-amber-200">
          Needs you
        </span>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300">
          See exactly what it'll do
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-400">
          {JSON.stringify(approval.pending_tool_input, null, 2)}
        </pre>
      </details>

      {!showReject ? (
        <div className="mt-4 flex gap-2">
          <button
            disabled={pending}
            onClick={() => startTransition(() => approve(approval.id))}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? "..." : "Approve"}
          </button>
          <button
            disabled={pending}
            onClick={() => setShowReject(true)}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why are you rejecting? (optional)"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              disabled={pending}
              onClick={() => startTransition(() => reject(approval.id, rejectReason))}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {pending ? "..." : "Confirm reject"}
            </button>
            <button
              onClick={() => setShowReject(false)}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function describeAction(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "quickbooks_create_bill") {
    const items = input.line_items as Array<{ amount: number; description: string }> | undefined;
    const total = items?.reduce((s, li) => s + li.amount, 0) ?? 0;
    const cur = (input.currency as string) ?? "";
    const doc = (input.doc_number as string) ?? "(no doc #)";
    return `Post a bill in QuickBooks: ${doc}, ${cur}${total.toFixed(2)}`;
  }
  if (toolName === "gmail_send") {
    return `Send email to ${input.to as string}: "${input.subject as string}"`;
  }
  if (toolName === "quickbooks_create_vendor") {
    return `Create QuickBooks vendor: ${input.display_name as string}`;
  }
  return `${toolName}`;
}
