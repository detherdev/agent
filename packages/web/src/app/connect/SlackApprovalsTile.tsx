"use client";

import { useState } from "react";

export function SlackApprovalsTile({
  installed,
  token,
  apiUrl,
}: {
  installed: boolean;
  token: string;
  apiUrl: string;
}) {
  const [busy, setBusy] = useState(false);

  const onInstall = () => {
    setBusy(true);
    // The API performs the OAuth dance and 302s back to /connect?slack=installed.
    window.location.href = `${apiUrl}/v1/slack/install/start?token=${encodeURIComponent(token)}`;
  };

  return (
    <li
      className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
      data-testid="tile-slack-approvals"
    >
      <div className="flex items-center gap-3">
        <div
          className={
            "h-2.5 w-2.5 rounded-full " + (installed ? "bg-emerald-400" : "bg-neutral-700")
          }
        />
        <div>
          <div className="text-sm font-medium text-neutral-100">Slack approvals</div>
          <div className="text-xs text-neutral-500">
            {installed
              ? "Approval cards land in Slack with Approve / Reject buttons."
              : "Install the bot to approve from Slack instead of the web inbox."}
          </div>
        </div>
      </div>
      {installed ? (
        <span className="text-xs text-neutral-500">Installed</span>
      ) : (
        <button
          disabled={busy}
          onClick={onInstall}
          data-testid="install-slack-bot"
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Redirecting…" : "Install"}
        </button>
      )}
    </li>
  );
}
