"use client";

import { useState } from "react";

export interface TeamsInstallStatusView {
  installed: boolean;
  status: "active" | "pending" | "revoked" | "none";
  tenant_id?: string;
}

const TEAMS_APP_ID = process.env.NEXT_PUBLIC_TEAMS_APP_ID ?? "";

export function TeamsApprovalsTile({
  status,
  token,
  apiUrl,
}: {
  status: TeamsInstallStatusView;
  token: string;
  apiUrl: string;
}) {
  const [tenant, setTenant] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(status);

  const onClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`${apiUrl}/v1/teams/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenant.trim() }),
      });
      if (!res.ok) throw new Error(`teams init failed: ${res.status} ${await res.text()}`);
      setLocalStatus({ ...localStatus, status: "pending" });
      if (TEAMS_APP_ID) {
        // Open the Teams deep link to add the bot in the user's tenant. The
        // bot's first activity completes the install.
        window.open(`https://teams.microsoft.com/l/app/${TEAMS_APP_ID}`, "_blank");
      }
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const dot = localStatus.installed
    ? "bg-emerald-400"
    : localStatus.status === "pending"
      ? "bg-amber-400"
      : "bg-neutral-700";
  const subtext = localStatus.installed
    ? "Approval cards land in your Teams channel."
    : localStatus.status === "pending"
      ? "Waiting for bot install — finish in Teams to activate."
      : "Approve from Teams Adaptive Cards instead of the web inbox.";

  return (
    <li
      className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
      data-testid="tile-teams-approvals"
    >
      <div className="flex flex-1 items-center gap-3">
        <div className={"h-2.5 w-2.5 rounded-full " + dot} />
        <div className="flex-1">
          <div className="text-sm font-medium text-neutral-100">Microsoft Teams approvals</div>
          <div className="text-xs text-neutral-500">{subtext}</div>
          {!localStatus.installed && (
            <form onSubmit={onClaim} className="mt-3 flex items-center gap-2">
              <input
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                placeholder="Microsoft Entra tenant id (UUID)"
                className="w-64 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600"
                data-testid="teams-tenant-input"
              />
              <button
                disabled={busy || tenant.length < 8}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                data-testid="teams-claim"
              >
                {busy ? "…" : localStatus.status === "pending" ? "Re-open Teams" : "Install"}
              </button>
            </form>
          )}
          {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
        </div>
      </div>
      {localStatus.installed && <span className="text-xs text-neutral-500">Installed</span>}
    </li>
  );
}
