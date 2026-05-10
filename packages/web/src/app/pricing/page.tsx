import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { MarketingFooter } from "@/components/MarketingFooter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing" };

const TIERS = [
  {
    slug: "trial",
    name: "Trial",
    price: "Free",
    price_unit: "for 14 days",
    description: "Get a feel for the platform with one of your real workflows.",
    cta: { label: "Start free trial", href: "/sign-up", variant: "primary" as const },
    features: [
      "50 workflow runs / month",
      "$5 of agent spend included",
      "3 active workflows",
      "1 seat",
      "All connectors (Gmail, QuickBooks, Outlook, Stripe, Slack, Drive)",
      "Approval inbox + run inspector",
    ],
  },
  {
    slug: "starter",
    name: "Starter",
    price: "$99",
    price_unit: "/ month",
    description: "For a solo operator or 2–3 person firm getting one painful job off their plate.",
    cta: { label: "Start free trial", href: "/sign-up", variant: "primary" as const },
    features: [
      "200 workflow runs / month",
      "$50 of agent spend included",
      "3 active workflows",
      "3 seats",
      "Email + Slack approvals",
      "Daily digest summary",
      "Standard support",
    ],
  },
  {
    slug: "pro",
    name: "Pro",
    price: "$399",
    price_unit: "/ month",
    description: "For 10–50 person teams running multiple jobs across functions.",
    cta: { label: "Start free trial", href: "/sign-up", variant: "primary" as const },
    highlight: true,
    features: [
      "1,000 workflow runs / month",
      "$200 of agent spend included",
      "Unlimited workflows",
      "10 seats",
      "Multi-phase tasks (month-end close, etc.)",
      "Workspace audit log",
      "Workspace-wide MFA enforcement",
      "Priority support",
    ],
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    price: "Custom",
    price_unit: "",
    description: "For regulated workflows or teams who want SSO, BAA, and a dedicated rep.",
    cta: { label: "Talk to us", href: "mailto:hello@yourdomain.com", variant: "secondary" as const },
    features: [
      "Unlimited runs and spend",
      "Unlimited seats",
      "SSO (Google, SAML)",
      "Data residency guarantees",
      "Dedicated account manager",
      "Custom DPA + BAA on request",
      "SOC2 report under NDA",
    ],
  },
];

const FAQ = [
  {
    q: "What counts as a workflow run?",
    a: "One trigger fire = one run. An invoice email arrives → 1 run. A scheduled chase fires Monday morning → 1 run. Approving a paused run doesn't cost a new run. Test pack runs are free.",
  },
  {
    q: "What about Anthropic costs?",
    a: "Every plan includes an Anthropic spend allowance ($5 trial / $50 Starter / $200 Pro). We meter every turn at Anthropic's published rates with no markup. You see usage live in Settings → Billing. We block new runs at the cap so you never get a surprise bill.",
  },
  {
    q: "Where is my data hosted?",
    a: "API + workers + Postgres in Toronto (YYZ). Some subprocessors (Anthropic, Clerk, Stripe, Sentry) operate from the US — see our privacy policy for the full list and the PIPEDA cross-border-transfer disclosure.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from the Stripe customer portal in Settings → Billing. Service continues through the end of your paid period. Your data sticks around for 30 days post-deletion in case you change your mind, then it's permanently purged.",
  },
  {
    q: "Do you offer a free tier?",
    a: "We offer a 14-day free trial with 50 runs and $5 of Anthropic spend included — enough to run one job end-to-end and form a real opinion. No card required to start.",
  },
  {
    q: "What if I run more than my plan allows?",
    a: "New runs pause at the cap. You'll get an email at 80% usage and at 100%. Upgrade in one click via Settings → Billing or wait for the period to reset. Existing runs already in flight always complete.",
  },
  {
    q: "Can I bring my own Anthropic key?",
    a: "Not at v1. We monitor for it as a customer-requested feature — if you're a heavy user with your own Anthropic agreement, talk to us.",
  },
  {
    q: "Is the platform SOC2 / HIPAA?",
    a: "SOC2 Type 1 evidence collection is underway; report available under NDA in Q3 2026 (or per your launch timeline). HIPAA / BAA: available on Enterprise plans with a signed agreement.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <MarketingHeader />

      {/* Hero */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-neutral-100 sm:text-5xl">
            Predictable pricing. No surprise AI bills.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-neutral-400">
            Every plan includes a workflow-run cap and a separate Anthropic-spend cap. We block at
            the limit so you never get a five-figure invoice from a runaway agent.
          </p>
        </div>
      </section>

      {/* Tiers */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((t) => (
              <div
                key={t.slug}
                className={
                  "flex flex-col rounded-xl border p-6 " +
                  (t.highlight
                    ? "border-emerald-500/40 bg-emerald-950/10"
                    : "border-neutral-800 bg-neutral-900/50")
                }
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-sm font-semibold text-neutral-100">{t.name}</div>
                  {t.highlight && (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                      Most chosen
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-semibold text-neutral-100">{t.price}</span>
                  {t.price_unit && (
                    <span className="text-sm text-neutral-500">{t.price_unit}</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-neutral-400">{t.description}</p>

                <ul className="mt-5 flex-1 space-y-2 text-sm text-neutral-300">
                  {t.features.map((f, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-emerald-500">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={t.cta.href}
                  className={
                    "mt-6 rounded-md px-3 py-2 text-center text-sm font-medium " +
                    (t.cta.variant === "primary"
                      ? "bg-emerald-600 text-white hover:bg-emerald-500"
                      : "border border-neutral-700 text-neutral-200 hover:bg-neutral-900")
                  }
                >
                  {t.cta.label}
                </Link>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-neutral-500">
            All prices in USD. CAD billing on request — talk to us.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">Common questions</h2>
          <dl className="mt-10 divide-y divide-neutral-900">
            {FAQ.map((item, i) => (
              <details key={i} className="group py-5">
                <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-neutral-100">
                  {item.q}
                  <span className="text-neutral-500 group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">{item.a}</p>
              </details>
            ))}
          </dl>
        </div>
      </section>

      {/* Final CTA */}
      <section>
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-100">
            Ready to take an hour back?
          </h2>
          <p className="mt-3 text-neutral-400">
            14-day trial. No card up front. Install one job. See if it&apos;s worth it.
          </p>
          <Link
            href="/sign-up"
            className="mt-6 inline-block rounded-md bg-emerald-600 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Start free trial
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
