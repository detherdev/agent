import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { MarketingFooter } from "@/components/MarketingFooter";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "AI assistant for Canadian bookkeeping firms",
  description:
    "Process invoices, chase overdue clients, prep month-end — without hiring another bookkeeper. Built for 5–50 person Canadian firms on QuickBooks Online.",
};

export default function BookkeepersPage() {
  return (
    <div className="min-h-screen">
      <MarketingHeader />

      {/* Hero */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="mb-4 inline-block rounded-full border border-emerald-900/60 bg-emerald-950/30 px-3 py-1 text-xs text-emerald-300">
            For Canadian bookkeeping firms · QuickBooks Online
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-neutral-100 sm:text-5xl">
            One AI bookkeeper who never sleeps. You stay in charge.
          </h1>
          <p className="mt-5 max-w-2xl text-balance text-lg text-neutral-400">
            Built for 5–50 person Canadian firms. Process incoming invoices into QuickBooks,
            chase overdue clients each Monday, prep month-end — all reviewed in your inbox
            before anything happens. Hosted in Toronto. PIPEDA-compliant.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="rounded-md bg-emerald-600 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Start free 14-day trial
            </Link>
            <Link
              href="/demo"
              className="rounded-md border border-neutral-700 px-5 py-3 text-sm text-neutral-200 hover:bg-neutral-900"
            >
              Book a 20-min walkthrough
            </Link>
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            No credit card to start. QuickBooks + Gmail connected via OAuth — never see your data.
          </p>
        </div>
      </section>

      {/* The math */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">
            What this costs you not having
          </h2>
          <p className="mt-3 max-w-2xl text-neutral-400">
            A 12-person firm with 80 monthly clients processes roughly 600 vendor invoices and
            sends 200 chase emails per month. At 4 minutes per invoice and 5 minutes per chase
            email, that&apos;s <span className="text-neutral-100">57 hours of recurring grunt work</span>{" "}
            a month — about one full bookkeeper salary every quarter, lit on fire.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Stat label="Hours / month back" value="40-60" detail="across invoice intake + AR chasing" />
            <Stat label="Pays for itself at" value="~15 invoices/mo" detail="Pro plan, 12 ⨯ clients" />
            <Stat label="Time to onboard" value="under 1 hour" detail="OAuth two tools; review starter prompt" />
          </div>
        </div>
      </section>

      {/* What it actually does */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">
            The three jobs we ship for bookkeepers today
          </h2>
          <ul className="mt-10 grid gap-6 sm:grid-cols-3">
            <Job
              n="01"
              name="Invoice → QuickBooks"
              tagline="Forward an invoice email — the bill draft lands in QB."
              steps={[
                "Reads the PDF / image via vision (no OCR setup)",
                "Looks up the vendor in QuickBooks; creates one if new",
                "Posts a bill draft with line items, tax, due date",
                "Replies to the vendor confirming receipt",
                "Asks you first on any amount over $1,000",
              ]}
            />
            <Job
              n="02"
              name="Chase late payments"
              tagline="Monday 9am: scan QB for overdue, draft polite reminders."
              steps={[
                "Groups overdue invoices by customer (one email each)",
                "Escalating tone: friendly → firm → final notice",
                "Checks Gmail for prior chase to avoid double-bugging",
                "Routes drafts to your inbox to approve before sending",
                "Final-notice tone always requires your sign-off",
              ]}
            />
            <Job
              n="03"
              name="Weekly AR review (Task)"
              tagline="Multi-phase: draft Monday, you review Tuesday, send Wednesday."
              steps={[
                "Phase 1: pull overdue list + generate drafts",
                "Phase 2: cool-off 24h, then human review gate",
                "Phase 3: ones you OK go out; rejected ones get re-drafted",
                "Reaper retries failed phases with backoff",
                "Full audit trail of who approved what when",
              ]}
            />
          </ul>
          <p className="mt-8 text-sm text-neutral-500">
            Coming next: expense categorization, month-end close prep, T4/T5 prep, client
            status emails. Want one of those first?{" "}
            <Link href="/demo" className="text-emerald-400">
              Tell us
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Trust */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">
            Why Canadian firms specifically
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <Trust
              title="Data stays in Canada"
              body="API, workers, Postgres — all in Toronto (Fly YYZ + a Canadian-region Postgres provider). PIPEDA-compliant. Quebec Bill 25 disclosures included in our privacy policy."
            />
            <Trust
              title="The agent never sees client data raw"
              body="OAuth tokens for Gmail / QuickBooks are held by Nango — we proxy through them. Your client list, invoice contents, and payment data flow through the agent but aren't trained on or retained beyond 90 days."
            />
            <Trust
              title="Approval inbox for anything sensitive"
              body="Outbound emails, bills over $1k, final-notice tone — everything risky waits for you. The 80% of routine work goes through; the 20% you'd want to check, you check."
            />
            <Trust
              title="Spend caps so the AI can't run away"
              body="Per-run budget + per-month workspace cap. When you hit the cap, new runs stop. No surprise $4,000 Anthropic invoice."
            />
          </div>
        </div>
      </section>

      {/* Onboarding */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">
            What onboarding looks like
          </h2>
          <ol className="mt-10 space-y-4">
            <Step
              n="1"
              title="Sign up (5 min)"
              body="Email + password through our auth provider. Workspace bootstraps automatically; 14-day trial starts."
            />
            <Step
              n="2"
              title="Connect QuickBooks + Gmail (5 min each)"
              body="One-click OAuth. We use Nango for token storage; we never see the credentials. Disconnect any time."
            />
            <Step
              n="3"
              title="Pick a job and tune the prompt (20–40 min)"
              body="Pre-built starter prompts work for 70% of firms out of the box. The other 30% need a quick tuning pass for your vocabulary (vendor naming, tax categories, tone). Setup Assistant chat walks you through it."
            />
            <Step
              n="4"
              title="Run shadow mode for a day (free)"
              body="The agent processes today's invoices but doesn't actually post to QB or send emails. You see exactly what it would have done. Flip on live when you're satisfied."
            />
          </ol>
          <p className="mt-8 text-sm text-neutral-400">
            Firms with non-QBO tools (Sage 50 desktop, Xero, etc.) or complex audit requirements
            get a 1-hour onboarding session with one of our founders.{" "}
            <Link href="/demo" className="text-emerald-400">
              Book it here
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">
            Most firms land on Pro
          </h2>
          <p className="mt-3 text-neutral-400">
            Pro is $399 / mo USD. Covers 1,000 runs and $200 of agent spend — enough for a
            12-person firm with 80 clients. Starter ($99) suits a 1–3 person practice.
          </p>
          <Link
            href="/pricing"
            className="mt-6 inline-block rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
          >
            See full pricing →
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-100">
            Take an hour back today.
          </h2>
          <p className="mt-3 text-neutral-400">
            Sign up, connect QuickBooks, forward one invoice. See what it does in shadow mode
            before letting it touch anything live.
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
              Or book a walkthrough
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-emerald-300">{value}</div>
      <p className="mt-2 text-sm text-neutral-400">{detail}</p>
    </div>
  );
}

function Job({
  n,
  name,
  tagline,
  steps,
}: {
  n: string;
  name: string;
  tagline: string;
  steps: string[];
}) {
  return (
    <li className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <div className="text-sm text-emerald-400">{n}</div>
      <div className="mt-2 text-base font-semibold text-neutral-100">{name}</div>
      <p className="mt-1 text-sm text-neutral-400">{tagline}</p>
      <ul className="mt-4 space-y-1.5 text-xs text-neutral-300">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-emerald-500">→</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </li>
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

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="flex gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="shrink-0 text-sm font-semibold text-emerald-400">{n}</div>
      <div>
        <div className="text-sm font-semibold text-neutral-100">{title}</div>
        <p className="mt-1 text-sm text-neutral-400">{body}</p>
      </div>
    </li>
  );
}
