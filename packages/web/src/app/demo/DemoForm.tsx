"use client";

import { useState, useTransition } from "react";
import { submitLead } from "./actions";

const SIZES = ["1-5", "6-20", "21-50", "50+"] as const;
const VERTICALS = [
  "Bookkeeping",
  "Recruiting",
  "Marketing agency",
  "Law / professional services",
  "Other",
];

export function DemoForm() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    name: "",
    company: "",
    size: "" as (typeof SIZES)[number] | "",
    vertical: "",
    message: "",
    _honey: "",
  });

  const set = (k: keyof typeof form, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await submitLead({
          ...form,
          source: "demo_form",
          referrer: typeof document !== "undefined" ? document.referrer : undefined,
        });
        setDone(true);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-6">
        <div className="text-base font-semibold text-emerald-200">Got it — we&apos;ll be in touch.</div>
        <p className="mt-2 text-sm text-emerald-100/80">
          One of the founders will email you within one business day to find a time. If
          it&apos;s urgent, you can reply to that mail and we&apos;ll move the slot up.
        </p>
        <p className="mt-3 text-xs text-emerald-300/60">
          In the meantime: feel free to{" "}
          <a href="/sign-up" className="underline">
            start a free trial
          </a>{" "}
          and poke around. The demo will be more useful if you&apos;ve seen the inbox screen.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6"
    >
      <div className="mb-1 text-base font-semibold text-neutral-100">Book a walkthrough</div>
      <p className="text-xs text-neutral-500">All fields except email are optional but help us prep.</p>

      <div className="mt-5 space-y-4">
        <Field label="Work email" required>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
            placeholder="you@firm.ca"
          />
        </Field>

        <Field label="Name">
          <input
            type="text"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
          />
        </Field>

        <Field label="Company">
          <input
            type="text"
            value={form.company}
            onChange={(e) => set("company", e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
          />
        </Field>

        <Field label="Team size">
          <div className="flex flex-wrap gap-2">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("size", form.size === s ? "" : s)}
                className={
                  "rounded-md px-3 py-1.5 text-xs " +
                  (form.size === s
                    ? "bg-emerald-600 text-white"
                    : "border border-neutral-700 text-neutral-300 hover:bg-neutral-900")
                }
              >
                {s}
              </button>
            ))}
          </div>
        </Field>

        <Field label="What kind of business?">
          <select
            value={form.vertical}
            onChange={(e) => set("vertical", e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
          >
            <option value="">Select…</option>
            {VERTICALS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field label="What recurring task would you most want to automate?">
          <textarea
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
            rows={4}
            placeholder="e.g. We get 60-100 vendor invoices per month by email. They go into QuickBooks as bills. Our bookkeeper spends 4 minutes each — that's most of a day every week."
            className="w-full resize-none rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
        </Field>

        {/* Honeypot — invisible to humans, irresistible to bots. */}
        <input
          type="text"
          name="website"
          value={form._honey}
          onChange={(e) => set("_honey", e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden
        />
      </div>

      {error && <p className="mt-4 text-xs text-red-300">{error}</p>}

      <button
        type="submit"
        disabled={pending || !form.email}
        className="mt-6 w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Request a walkthrough"}
      </button>

      <p className="mt-3 text-xs text-neutral-500">
        We&apos;ll only use this to schedule the call. No marketing emails unless you opt in.
      </p>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <div className="mb-1 text-neutral-300">
        {label}
        {required && <span className="ml-1 text-neutral-500">*</span>}
      </div>
      {children}
    </label>
  );
}
