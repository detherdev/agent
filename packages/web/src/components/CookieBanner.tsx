"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "cookie-consent.v1";

type Decision = "accepted" | "essential-only";

export function CookieBanner() {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "accepted" || v === "essential-only") setDecision(v);
    } catch {
      // localStorage unavailable; just show the banner once per session.
    }
  }, []);

  if (!mounted || decision) return null;

  const choose = (d: Decision) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, d);
    } catch {
      // ignore
    }
    setDecision(d);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-300">
          We use functional cookies for sign-in plus a small set of analytics cookies to
          improve the product.{" "}
          <Link href="/legal/privacy" className="text-emerald-400 underline">
            Privacy policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => choose("essential-only")}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-900"
          >
            Essential only
          </button>
          <button
            onClick={() => choose("accepted")}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
