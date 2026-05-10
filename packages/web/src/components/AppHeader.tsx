import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

const NAV = [
  { href: "/inbox", label: "Inbox" },
  { href: "/status", label: "Status" },
  { href: "/runs", label: "Runs" },
  { href: "/jobs", label: "Jobs" },
  { href: "/connect", label: "Accounts" },
];

export function AppHeader({ pendingCount }: { pendingCount?: number }) {
  return (
    <header className="border-b border-neutral-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
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
        <UserButton afterSignOutUrl="/sign-in" />
      </div>
    </header>
  );
}
