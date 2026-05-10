"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/settings/billing", label: "Billing & usage" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/data", label: "Data" },
  { href: "/settings/profile", label: "Your account" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-row gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
      {ITEMS.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "shrink-0 rounded-md px-3 py-2 text-sm whitespace-nowrap " +
              (active
                ? "bg-neutral-900 text-neutral-100"
                : "text-neutral-400 hover:bg-neutral-900/60 hover:text-neutral-200")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
