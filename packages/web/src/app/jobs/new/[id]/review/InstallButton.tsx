"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { install } from "../actions";

export function InstallButton({ draftId }: { draftId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onClick = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await install(draftId);
        router.push(`/runs?workflow_id=${res.workflow_id}`);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={onClick}
        disabled={pending}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? "Installing…" : "Install and start"}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
