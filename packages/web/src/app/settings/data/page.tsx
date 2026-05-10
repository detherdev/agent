import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateWorkspace } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-base font-semibold text-neutral-100">Export your data</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Download everything in your workspace — workflows, runs, turns, approvals, tasks,
          connection metadata, and the audit log — as a JSON archive. We honour requests
          under PIPEDA s. 8 (right of access).
        </p>
        <button
          disabled
          title="Wires in next slice"
          className="mt-4 rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 opacity-60"
        >
          Request export
        </button>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-base font-semibold text-neutral-100">Data retention</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Run inputs, outputs, and turn-by-turn traces are retained for{" "}
          <span className="text-neutral-200">90 days</span> for active workspaces, then
          auto-purged. Approval decisions and the audit log are retained for the duration of
          the subscription.
        </p>
        <p className="mt-2 text-sm text-neutral-400">
          See{" "}
          <Link href="/legal/privacy" className="text-emerald-400 underline">
            our privacy policy
          </Link>{" "}
          for the full disclosure.
        </p>
      </section>

      <section className="rounded-xl border border-red-900/50 bg-red-950/20 p-6">
        <h2 className="text-base font-semibold text-red-200">Delete this workspace</h2>
        <p className="mt-2 text-sm text-red-300/80">
          Marks the workspace for deletion. Triggers stop firing immediately; your data is
          purged after a 30-day grace period (so accidental deletes are recoverable). After
          purge, this action is irreversible.
        </p>
        <button
          disabled
          title="Wires in next slice"
          className="mt-4 rounded-md border border-red-700/50 bg-red-950/50 px-3 py-1.5 text-sm text-red-200 opacity-60"
        >
          Delete workspace
        </button>
      </section>
    </div>
  );
}
