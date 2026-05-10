"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startTaskAction } from "./actions";

interface SchemaProperty {
  type?: string;
  description?: string;
}

export function StartForm({
  slug,
  inputSchema,
}: {
  slug: string;
  inputSchema: Record<string, unknown>;
}) {
  const props = (inputSchema?.properties ?? {}) as Record<string, SchemaProperty>;
  const propEntries = Object.entries(props);

  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = () =>
    startTransition(async () => {
      setError(null);
      try {
        const input: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(values)) if (v) input[k] = v;
        const result = await startTaskAction(slug, input);
        router.push(`/tasks/${result.task_id}`);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Inputs</div>

      {propEntries.length === 0 ? (
        <p className="text-sm text-neutral-400">This task takes no inputs.</p>
      ) : (
        <ul className="space-y-3">
          {propEntries.map(([key, schema]) => (
            <li key={key}>
              <label className="block text-sm">
                <div className="text-neutral-200">{key}</div>
                {schema.description && (
                  <div className="text-xs text-neutral-500">{schema.description}</div>
                )}
                <input
                  type="text"
                  value={values[key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
                />
              </label>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-4 text-xs text-red-300">{error}</p>}

      <button
        onClick={onSubmit}
        disabled={pending}
        className="mt-6 w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? "Starting…" : "Start task"}
      </button>
    </div>
  );
}
