import { listPendingApprovals } from "@/lib/api";
import { ApprovalCard } from "./ApprovalCard";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const items = await listPendingApprovals();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <span className="text-sm text-neutral-500">
          {items.length} waiting on you
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-6 py-16 text-center">
          <p className="text-neutral-400">All caught up.</p>
          <p className="mt-1 text-sm text-neutral-600">
            Your assistant will park items here when it needs your sign-off.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id}>
              <ApprovalCard approval={a} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
