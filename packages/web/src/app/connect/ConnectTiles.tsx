"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RequiredProvider } from "@/lib/api";
import { startConnect, advanceAfterConnect } from "./actions";

const PROVIDER_DISPLAY: Record<string, { name: string; icon?: string }> = {
  gmail: { name: "Gmail" },
  outlook: { name: "Outlook" },
  quickbooks: { name: "QuickBooks" },
  stripe: { name: "Stripe" },
  slack: { name: "Slack" },
  hubspot: { name: "HubSpot" },
  "google-drive": { name: "Google Drive" },
  plaid: { name: "Plaid (bank feeds)" },
  netsuite: { name: "NetSuite" },
};

export function ConnectTiles({
  providers: initial,
  next,
}: {
  providers: RequiredProvider[];
  next: { href: string; label: string };
}) {
  const [providers, setProviders] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Poll connection status while a Connect modal might be open. Cheap and
  // robust; the source of truth is Nango's webhook → our DB.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(async () => {
      const res = await fetch("/api/connect-status", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as RequiredProvider[];
      setProviders(data);
      if (data.find((p) => p.provider === busy)?.connected) setBusy(null);
    }, 2000);
    return () => clearInterval(id);
  }, [busy]);

  const onConnect = async (provider: string) => {
    setErr(null);
    setBusy(provider);
    try {
      const { sessionToken } = await startConnect([provider]);
      const { default: Nango } = await import("@nangohq/frontend");
      const nango = new Nango({ connectSessionToken: sessionToken });
      await nango.openConnectUI({
        sessionToken,
        onEvent: (event) => {
          if (event.type === "close") setBusy(null);
        },
      });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  };

  const allConnected = providers.length > 0 && providers.every((p) => p.connected);

  const onContinue = () =>
    startTransition(async () => {
      await advanceAfterConnect();
      router.push(next.href);
    });

  return (
    <div>
      <ul className="space-y-3" data-testid="connect-tiles">
        {providers.map((p) => {
          const display = PROVIDER_DISPLAY[p.provider]?.name ?? p.provider;
          return (
            <li
              key={p.provider}
              className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
              data-testid={`tile-${p.provider}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={
                    "h-2.5 w-2.5 rounded-full " +
                    (p.connected ? "bg-emerald-400" : "bg-neutral-700")
                  }
                />
                <div>
                  <div className="text-sm font-medium text-neutral-100">{display}</div>
                  <div className="text-xs text-neutral-500">
                    {p.connected ? "Connected" : "Not connected"}
                  </div>
                </div>
              </div>
              {p.connected ? (
                <span className="text-xs text-neutral-500">Done</span>
              ) : (
                <button
                  disabled={busy === p.provider}
                  onClick={() => onConnect(p.provider)}
                  data-testid={`connect-${p.provider}`}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy === p.provider ? "Connecting…" : "Connect"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {err && <p className="mt-4 text-sm text-red-400">{err}</p>}

      <div className="mt-8 flex justify-end">
        <button
          disabled={!allConnected || pending}
          onClick={onContinue}
          data-testid="connect-continue"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "..." : next.label}
        </button>
      </div>
    </div>
  );
}
