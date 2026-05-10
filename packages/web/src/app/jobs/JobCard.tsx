"use client";

import { useTransition } from "react";
import { installJob } from "./actions";
import type { CatalogJob } from "@/lib/api";

export function JobCard({ job }: { job: CatalogJob }) {
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="flex h-full flex-col justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 p-5"
      data-testid={`job-card-${job.slug}`}
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-neutral-100">{job.name}</h3>
          {job.installed && (
            <span className="shrink-0 rounded-full bg-emerald-950 px-2 py-0.5 text-xs text-emerald-200">
              Installed
            </span>
          )}
        </div>
        {job.tagline && (
          <p className="mt-2 text-sm text-neutral-400">{job.tagline}</p>
        )}

        {(job.what_youll_connect?.length ?? 0) > 0 && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">You'll connect</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {job.what_youll_connect!.map((c) => (
                <span
                  key={c}
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-xs text-neutral-300"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {job.time_saved && (
          <div className="mt-4 text-xs text-neutral-500">
            Saves about <span className="text-neutral-300">{job.time_saved}</span>
          </div>
        )}
      </div>

      <div className="mt-5">
        {job.installed ? (
          <button
            disabled
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-500"
          >
            Already added
          </button>
        ) : (
          <button
            disabled={pending}
            data-testid={`install-${job.slug}`}
            onClick={() => startTransition(() => installJob(job.pack, job.slug))}
            className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? "Adding..." : "Add to my workspace"}
          </button>
        )}
      </div>
    </div>
  );
}
