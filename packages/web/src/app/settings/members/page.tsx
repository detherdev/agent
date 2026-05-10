import { redirect } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-neutral-100">Workspace members</h2>
          <button
            disabled
            title="Multi-seat invites ship with the Pro plan"
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white opacity-60"
          >
            Invite teammate
          </button>
        </div>

        <ul className="mt-4 divide-y divide-neutral-900">
          <li className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm text-neutral-100">{ctx.email}</div>
              <div className="text-xs text-neutral-500">You</div>
            </div>
            <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
              Owner
            </span>
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30 p-6 text-sm text-neutral-400">
        <div className="font-medium text-neutral-300">Coming soon</div>
        <p className="mt-1">
          Email-based invites, role-based access (Owner / Admin / Member), and per-member MFA
          enforcement land with the multi-seat Pro plan.
        </p>
      </section>
    </div>
  );
}
