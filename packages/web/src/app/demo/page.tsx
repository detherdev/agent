import { MarketingHeader } from "@/components/MarketingHeader";
import { MarketingFooter } from "@/components/MarketingFooter";
import { DemoForm } from "./DemoForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Book a walkthrough",
  description:
    "20-minute demo with the founders. We'll walk through one of your real workflows and show you what the agent would do.",
};

export default function DemoPage() {
  return (
    <div className="min-h-screen">
      <MarketingHeader />

      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          {/* Left: pitch + what to expect */}
          <div>
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-neutral-100 sm:text-4xl">
              20 minutes. One of your real workflows.
            </h1>
            <p className="mt-4 text-neutral-400">
              The fastest way to see whether this works for you is to walk through one of
              <em> your </em>real processes — your invoices, your clients, your tone — not
              a generic demo video.
            </p>

            <h2 className="mt-10 text-xs uppercase tracking-wide text-neutral-500">
              What we&apos;ll cover
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-neutral-300">
              <li className="flex gap-2">
                <span className="text-emerald-500">→</span>
                <span>
                  <span className="text-neutral-100">5 min</span> — you describe one
                  recurring task you wish was automated
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-500">→</span>
                <span>
                  <span className="text-neutral-100">10 min</span> — we configure it live
                  on a sandbox workspace; you watch
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-500">→</span>
                <span>
                  <span className="text-neutral-100">5 min</span> — we run it in shadow
                  mode against one of your real samples
                </span>
              </li>
            </ul>

            <h2 className="mt-10 text-xs uppercase tracking-wide text-neutral-500">
              Who this is for
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-neutral-400">
              <li>
                <span className="text-neutral-200">Canadian bookkeeping firms</span>,
                5–50 people, on QuickBooks Online or Xero
              </li>
              <li>
                <span className="text-neutral-200">Recruiting agencies</span> with
                inbound CV volume
              </li>
              <li>
                <span className="text-neutral-200">Service firms</span> spending hours on
                client status emails or month-end prep
              </li>
              <li>
                Anyone whose current process is &ldquo;forward an email, do something,
                forward another email&rdquo;
              </li>
            </ul>

            <p className="mt-10 text-xs text-neutral-500">
              Founder-led for the first 20 customers. Free. We&apos;re honest if we&apos;re not the
              right fit.
            </p>
          </div>

          {/* Right: form */}
          <div>
            <DemoForm />
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
