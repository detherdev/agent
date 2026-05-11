import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { MarketingFooter } from "@/components/MarketingFooter";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Alternative to Zapier for AI workflows",
  description:
    "Why agent-native beats Zapier's Zaps for small-business workflows where every input is a little different.",
};

export default function VsZapierPage() {
  return (
    <div className="min-h-screen">
      <MarketingHeader />

      {/* Hero */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <div className="mb-4 inline-block rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-400">
            Comparison
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-neutral-100 sm:text-5xl">
            An alternative to Zapier for the work that doesn&apos;t fit a Zap.
          </h1>
          <p className="mt-5 max-w-2xl text-balance text-lg text-neutral-400">
            Zapier&apos;s great when every input is identical. It breaks the moment you need
            judgment — and at a small business, that&apos;s most days. Here&apos;s when we&apos;re a
            better fit, and when Zapier still wins.
          </p>
        </div>
      </section>

      {/* The honest two-column */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid gap-px overflow-hidden rounded-xl bg-neutral-900 sm:grid-cols-2">
            <Column
              title="Use Zapier when"
              tone="neutral"
              points={[
                "Inputs are perfectly structured (form submissions with named fields)",
                "Each step is a single API call you can wire by hand",
                "You don't need a human to review anything",
                "The workflow is short — 2-5 steps",
                "You already use 10+ Zaps and your team knows the editor",
              ]}
            />
            <Column
              title="Use us when"
              tone="ours"
              points={[
                "Inputs vary (every invoice PDF, every CV, every client email is different)",
                "Steps depend on what the previous step found (branch / re-plan)",
                "Some actions need human review before they go (emails, money moves)",
                "You're not technical and don't want to learn another editor",
                "You work in a Canadian regulated vertical (bookkeeping, recruiting, law)",
              ]}
            />
          </div>
        </div>
      </section>

      {/* Detailed comparison table */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">
            Side-by-side
          </h2>
          <div className="mt-8 overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3" />
                  <th className="px-4 py-3 text-neutral-300">Zapier</th>
                  <th className="px-4 py-3 text-emerald-300">Us</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                <Row
                  label="Setup mental model"
                  z="Drag-and-drop nodes; each step pre-wired"
                  us="Describe in English; agent picks each next step"
                />
                <Row
                  label="Handles variable input"
                  z="Brittle — every shape needs a new branch"
                  us="Agent re-plans per turn; new invoice layouts just work"
                />
                <Row
                  label="Approval / human-in-the-loop"
                  z="Possible via paths; clunky to set up"
                  us="First-class — approval inbox is core UX"
                />
                <Row
                  label="Document / PDF understanding"
                  z="Needs a separate OCR/extraction Zap; brittle on layout shifts"
                  us="Built-in Claude vision; reads PDFs / images natively"
                />
                <Row
                  label="Multi-day workflows with checkpoints"
                  z="No native concept; build with Schedule + Storage"
                  us="Tasks abstraction: phases with dependencies + retries"
                />
                <Row
                  label="Data residency (Canada)"
                  z="US-only as of public docs"
                  us="Hosted in Toronto / YYZ; PIPEDA-compliant; Bill 25 disclosures"
                />
                <Row
                  label="Pricing for moderate use"
                  z="$30–80/mo for the volume an SMB needs"
                  us="$99/mo Starter; includes Anthropic spend cap"
                />
                <Row
                  label="When you're a one-person team"
                  z="✓ Probably overkill but works"
                  us="🟡 Best when you have at least one painful job"
                />
                <Row
                  label="Integration breadth"
                  z="✓ Thousands of Zaps. Hard to beat."
                  us="🟡 ~250 OAuth connectors via Nango + MCP + email-in fallback"
                />
                <Row
                  label="Custom code / scripts"
                  z="✓ Code by Zapier (JS / Python)"
                  us="🟡 HTTP + SQL tools; code-running tool ships later"
                />
                <Row
                  label="Reliability at scale"
                  z="✓ Battle-tested; runs trillions"
                  us="🟡 New platform; design-partner stage"
                />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* When to switch */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">
            The honest version: should you switch?
          </h2>
          <div className="mt-8 space-y-4">
            <Honest
              tag="Stay on Zapier if"
              tone="neutral"
              body="Your Zaps work and your team already maintains them. We're not a 1:1 replacement — we replace different work. Keep using Zapier for the deterministic glue (form → Sheet → Slack notification)."
            />
            <Honest
              tag="Switch (or add us) if"
              tone="emerald"
              body="You've tried to automate something with judgement-heavy input — invoice processing, candidate screening, support triage, AR chasing — and your Zap chains keep breaking on edge cases. That's exactly the work we're built for."
            />
            <Honest
              tag="Run us alongside if"
              tone="neutral"
              body="The boring deterministic stuff stays in Zapier. The judgement work (and anything where you want a human gate) moves here. We can call into Zapier webhooks; Zapier can trigger our /v1/webhooks/:workflow_id."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-100">
            See it on your own work, free for 14 days.
          </h2>
          <p className="mt-3 text-neutral-400">
            Sign up, install one job, run shadow mode against your last 30 days of email. Decide
            from real evidence whether it&apos;s better than your current Zap.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/sign-up"
              className="rounded-md bg-emerald-600 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Start free trial
            </Link>
            <Link
              href="/demo"
              className="rounded-md border border-neutral-700 px-5 py-3 text-sm text-neutral-200 hover:bg-neutral-900"
            >
              Book a walkthrough
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

function Column({
  title,
  tone,
  points,
}: {
  title: string;
  tone: "neutral" | "ours";
  points: string[];
}) {
  return (
    <div className="bg-neutral-950 p-6">
      <div
        className={
          "mb-4 text-sm font-semibold " + (tone === "ours" ? "text-emerald-300" : "text-neutral-300")
        }
      >
        {title}
      </div>
      <ul className="space-y-2 text-sm text-neutral-300">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2">
            <span className={tone === "ours" ? "text-emerald-500" : "text-neutral-600"}>•</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, z, us }: { label: string; z: string; us: string }) {
  return (
    <tr>
      <td className="px-4 py-3 text-neutral-500">{label}</td>
      <td className="px-4 py-3 text-neutral-300">{z}</td>
      <td className="px-4 py-3 text-neutral-200">{us}</td>
    </tr>
  );
}

function Honest({
  tag,
  body,
  tone,
}: {
  tag: string;
  body: string;
  tone: "neutral" | "emerald";
}) {
  return (
    <div
      className={
        "rounded-xl border p-5 " +
        (tone === "emerald"
          ? "border-emerald-900/40 bg-emerald-950/10"
          : "border-neutral-800 bg-neutral-900/50")
      }
    >
      <div
        className={
          "mb-2 text-xs uppercase tracking-wide " +
          (tone === "emerald" ? "text-emerald-300" : "text-neutral-400")
        }
      >
        {tag}
      </div>
      <p className="text-sm text-neutral-200">{body}</p>
    </div>
  );
}
