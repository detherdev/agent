import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateWorkspace } from "@/lib/auth";
import { MarketingHeader } from "@/components/MarketingHeader";
import { MarketingFooter } from "@/components/MarketingFooter";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Signed-in: route into the app (same behavior as before).
  const { userId } = await auth();
  if (userId) {
    const ctx = await getOrCreateWorkspace();
    if (!ctx) redirect("/sign-in");
    if (ctx.onboarding_step < 3) redirect("/onboarding");
    redirect("/inbox");
  }

  // Signed-out: marketing landing.
  return (
    <div className="min-h-screen">
      <MarketingHeader />

      {/* Hero */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center">
          <div className="mb-4 inline-block rounded-full border border-emerald-900/60 bg-emerald-950/30 px-3 py-1 text-xs text-emerald-300">
            Built for Canadian SMBs · Hosted in Toronto · PIPEDA-compliant
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-neutral-100 sm:text-5xl">
            An assistant that actually does the work.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-neutral-400">
            Forward an invoice — it lands in QuickBooks. Receive a candidate — it scores against your
            open roles. Monday morning — overdue clients get a polite nudge with your sign-off. You
            stay in control of anything that matters.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/sign-up"
              className="rounded-md bg-emerald-600 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Start free 14-day trial
            </Link>
            <Link
              href="/pricing"
              className="rounded-md border border-neutral-700 px-5 py-3 text-sm text-neutral-200 hover:bg-neutral-900"
            >
              See pricing
            </Link>
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            No card required. Connect Gmail or QuickBooks in two clicks. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Why we're different */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">
            Why this is different from Zapier / Gumloop / n8n
          </h2>
          <p className="mt-3 max-w-2xl text-neutral-400">
            The big workflow tools wire boxes together with arrows. That&apos;s fine for &ldquo;scrape this
            URL every hour.&rdquo; It breaks the second your inputs aren&apos;t identical — and at a small
            business, no two invoices, candidates, or client emails ever are.
          </p>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl bg-neutral-900 sm:grid-cols-2">
            <Compare
              title="The DAG approach"
              tone="bad"
              points={[
                "You wire each step yourself",
                "Breaks on any input the builder didn't anticipate",
                "Connectors are hand-built — long tail is empty",
                "Errors are silent until something downstream is wrong",
              ]}
            />
            <Compare
              title="Agent-native"
              tone="good"
              points={[
                "You describe the job in English; the agent picks each next step",
                "Adapts to novel inputs — every invoice is different and that's fine",
                "Native MCP + Nango: 250+ integrations on day one",
                "Loop is visible turn-by-turn; you can intervene mid-run",
              ]}
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">How it works</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            <HowStep
              n={1}
              title="Tell it what to do"
              body="Pick a template or chat with the Setup Assistant in plain English. It interviews you, builds a spec, generates test cases."
            />
            <HowStep
              n={2}
              title="Connect your accounts"
              body="One-click OAuth into Gmail, QuickBooks, Outlook, Stripe, Slack, Drive — or just forward to your assistant's email inbox if you'd rather skip the OAuth."
            />
            <HowStep
              n={3}
              title="Approve the important stuff"
              body="Routine work goes through on its own. Anything sensitive — bills over $1k, emails to top clients, final-notice tone — parks in your inbox for a one-click OK."
            />
          </ol>
        </div>
      </section>

      {/* Jobs it handles */}
      <section id="jobs" className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">
            What it handles out of the box
          </h2>
          <p className="mt-3 max-w-2xl text-neutral-400">
            Pre-built jobs across the functions a 10-person business actually has. Install one in two
            clicks, tweak the prompts to your voice, and you&apos;re running.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <JobCard
              vertical="Bookkeeping"
              name="Invoice → QuickBooks"
              body="Forward any invoice email. I read the PDF via vision, look up the vendor, post a draft bill, reply to the sender. Asks you first on amounts over $1k."
            />
            <JobCard
              vertical="Bookkeeping"
              name="Chase late payments"
              body="Each Monday I scan QuickBooks for overdue invoices, group by customer, draft escalating reminders. Final-notice tone always needs your sign-off."
            />
            <JobCard
              vertical="Sales"
              name="Qualify inbound leads"
              body="Hot / warm / cold against your ICP. Drafts a tailored reply. Posts to your team Slack with the draft below — you approve to send."
            />
            <JobCard
              vertical="Sales"
              name="Prep me for a meeting"
              body="Pulls your Gmail history with the attendees, summarizes what was discussed, what's open, suggested talking points. 200 words in Slack."
            />
            <JobCard
              vertical="HR"
              name="Triage incoming resumes"
              body="Reads the resume via vision, scores against your open roles, posts a one-line summary to the hiring Slack with the candidate's match level."
            />
            <JobCard
              vertical="Support"
              name="Triage support tickets"
              body="Classifies inbound mail (billing / bug / how-to / complaint), sets urgency, drafts a calm reply, pings Slack. You approve before any reply goes out."
            />
          </div>
          <p className="mt-8 text-sm text-neutral-500">
            Plus: month-end close, new-hire onboarding, weekly AR review, social-post drafting — and{" "}
            <Link href="/sign-up" className="text-emerald-400">
              build your own in chat
            </Link>{" "}
            when none of the templates fit.
          </p>
          <div className="mt-6">
            <Link
              href="/for/bookkeepers"
              className="text-sm text-emerald-400 hover:text-emerald-300"
            >
              Specifically a Canadian bookkeeping firm? See the deeper writeup →
            </Link>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">
            Built for SMBs who are nervous about AI
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Trust
              title="Approval gates on anything risky"
              body="Outbound email, money movement, communications to top clients — you set the rules; everything sensitive lands in your inbox for a quick OK."
            />
            <Trust
              title="Shadow-mode before you go live"
              body="Run any new job against your last 30 days of real data in dry-run first. See what it would have done. Then flip it on."
            />
            <Trust
              title="Turn-by-turn audit"
              body="Every run shows you every step the agent took, every tool call, every result. Nothing is a black box."
            />
            <Trust
              title="Spend caps per job and per workspace"
              body="Set a monthly budget. We block at the limit. No surprise Anthropic bills."
            />
            <Trust
              title="Canadian data residency"
              body="API, workers, Postgres — all in Toronto (YYZ). PIPEDA-compliant. Quebec Bill 25 disclosures included."
            />
            <Trust
              title="One-click data export and delete"
              body="Export your whole workspace as JSON. Delete it with a 30-day grace period. Your data is yours."
            />
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">
            Simple, predictable pricing
          </h2>
          <p className="mt-3 text-neutral-400">
            Starter $99 / mo · Pro $399 / mo · Enterprise custom. 14-day free trial, no card up front.
          </p>
          <Link
            href="/pricing"
            className="mt-6 inline-block rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
          >
            See plans →
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section>
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-100">
            Take an hour back today.
          </h2>
          <p className="mt-3 text-neutral-400">
            Sign up, install one job, let it handle today&apos;s invoices or candidates. You decide what
            it ships.
          </p>
          <Link
            href="/sign-up"
            className="mt-6 inline-block rounded-md bg-emerald-600 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Start free 14-day trial
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

function Compare({
  title,
  tone,
  points,
}: {
  title: string;
  tone: "good" | "bad";
  points: string[];
}) {
  return (
    <div className="bg-neutral-950 p-6">
      <div
        className={
          "mb-4 text-sm font-semibold " + (tone === "good" ? "text-emerald-300" : "text-neutral-400")
        }
      >
        {title}
      </div>
      <ul className="space-y-2 text-sm text-neutral-300">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2">
            <span className={tone === "good" ? "text-emerald-500" : "text-neutral-600"}>
              {tone === "good" ? "✓" : "—"}
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HowStep({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <div className="text-sm text-emerald-400">{n.toString().padStart(2, "0")}</div>
      <div className="mt-2 text-base font-semibold text-neutral-100">{title}</div>
      <p className="mt-2 text-sm text-neutral-400">{body}</p>
    </li>
  );
}

function JobCard({ vertical, name, body }: { vertical: string; name: string; body: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{vertical}</div>
      <div className="mt-1 text-sm font-semibold text-neutral-100">{name}</div>
      <p className="mt-2 text-sm text-neutral-400">{body}</p>
    </div>
  );
}

function Trust({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="text-sm font-semibold text-neutral-100">{title}</div>
      <p className="mt-2 text-sm text-neutral-400">{body}</p>
    </div>
  );
}
