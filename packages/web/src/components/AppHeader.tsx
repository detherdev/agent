import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import type { PlanTier } from "@/lib/auth";

const NAV = [
  { href: "/inbox", label: "Inbox" },
  { href: "/status", label: "Status" },
  { href: "/tasks", label: "Tasks" },
  { href: "/runs", label: "Runs" },
  { href: "/jobs", label: "Jobs" },
  { href: "/connect", label: "Accounts" },
];

export function AppHeader({
  pendingCount,
  planTier,
  trialEndsAt,
}: {
  pendingCount?: number;
  planTier?: PlanTier;
  trialEndsAt?: string | null;
}) {
  const trialDaysLeft =
    planTier === "trial" && trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null;

  return (
    <header className="border-b border-neutral-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
            >
              {item.label}
              {item.href === "/inbox" && pendingCount && pendingCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-amber-950 px-1.5 py-0.5 text-xs text-amber-200">
                  {pendingCount}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {trialDaysLeft != null && (
            <Link
              href="/settings/billing"
              className={
                "rounded-full border px-2.5 py-1 text-xs font-medium " +
                (trialDaysLeft <= 3
                  ? "border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-950/60"
                  : "border-amber-900/60 bg-amber-950/40 text-amber-200 hover:bg-amber-950/60")
              }
            >
              {trialDaysLeft > 0
                ? `Trial: ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`
                : "Trial expired"}
            </Link>
          )}
          <Link
            href="/settings/billing"
            className="rounded-md px-2.5 py-1.5 text-sm text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
            title="Settings"
          >
            Settings
          </Link>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </div>
    </header>
  );
}
