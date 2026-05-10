export const metadata = { title: "Privacy Policy" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <article className="prose prose-invert max-w-none text-neutral-200">
      <p className="text-xs uppercase tracking-wide text-neutral-500">
        Starter template — review with counsel before launch. Operator note: replace
        bracketed placeholders with your real entity name + address + DPO contact.
      </p>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-neutral-500">Last updated: insert date before launch.</p>

      <h2>Who we are</h2>
      <p>
        [Your company legal name] is a Canadian-incorporated business operating from [city,
        province]. This policy covers personal information we process to provide the service.
      </p>

      <h2>Personal information we collect</h2>
      <ul>
        <li>
          <strong>Account info</strong>: name, email, workspace name (via Clerk).
        </li>
        <li>
          <strong>Connection metadata</strong>: which third-party accounts you&apos;ve
          authorized (Gmail, QuickBooks, etc.) and the identifiers needed to call them on
          your behalf. We do not see the raw OAuth tokens — those are held by our provider
          Nango.
        </li>
        <li>
          <strong>Run content</strong>: the input you (or your triggers) send to an agent,
          and the intermediate / final output. This includes forwarded email bodies and
          attachments processed by document understanding.
        </li>
        <li>
          <strong>Billing</strong>: handled by Stripe. We hold a Stripe customer ID but no
          card numbers.
        </li>
        <li>
          <strong>Audit log</strong>: who in your workspace decided which approvals, installed
          which workflows, and made which connection changes.
        </li>
      </ul>

      <h2>Why we process it</h2>
      <p>
        To operate the service, bill for it, enforce plan limits, debug customer-reported
        issues, and meet our security and compliance obligations. Legal bases under PIPEDA:
        performance of contract, legitimate interest, and consent (cookies and marketing
        communications).
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Run inputs / outputs / turn traces: 90 days then auto-purged</li>
        <li>Approval decisions + audit log: duration of the subscription, then 1 year</li>
        <li>Billing records: 7 years (Canadian tax retention)</li>
        <li>Workspace deletion: data marked for deletion is purged after 30 days</li>
      </ul>

      <h2>Subprocessors (where your data goes)</h2>
      <table>
        <thead>
          <tr>
            <th>Subprocessor</th>
            <th>Purpose</th>
            <th>Region</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Anthropic</td>
            <td>The Claude model that drives agent runs</td>
            <td>United States</td>
          </tr>
          <tr>
            <td>Clerk</td>
            <td>Authentication (sign-in, MFA, sessions)</td>
            <td>United States</td>
          </tr>
          <tr>
            <td>Nango</td>
            <td>OAuth token storage and proxied SaaS calls</td>
            <td>United States / EU (per their config)</td>
          </tr>
          <tr>
            <td>Stripe</td>
            <td>Billing</td>
            <td>United States / Canada</td>
          </tr>
          <tr>
            <td>Postmark</td>
            <td>Inbound email routing to workspace inboxes</td>
            <td>United States</td>
          </tr>
          <tr>
            <td>Fly.io</td>
            <td>API + worker compute</td>
            <td>Canada (Toronto / YYZ region)</td>
          </tr>
          <tr>
            <td>[DB provider]</td>
            <td>Postgres for run state, approvals, audit log</td>
            <td>Canada</td>
          </tr>
          <tr>
            <td>Sentry</td>
            <td>Error tracking</td>
            <td>United States / EU (per their config)</td>
          </tr>
        </tbody>
      </table>
      <p>
        Cross-border transfers to the United States are governed by Canada&apos;s PIPEDA
        cross-border-transfer framework. We&apos;ve executed Data Processing Agreements with
        each subprocessor.
      </p>

      <h2>Your rights under PIPEDA</h2>
      <ul>
        <li>
          <strong>Access</strong>: download all your workspace data anytime at{" "}
          <a href="/settings/data" className="text-emerald-400">Settings → Data</a>.
        </li>
        <li>
          <strong>Correction</strong>: contact us if anything we hold is inaccurate.
        </li>
        <li>
          <strong>Deletion</strong>: delete your workspace at any time from the same page.
        </li>
        <li>
          <strong>Complaint</strong>: you may complain to the Office of the Privacy
          Commissioner of Canada (priv.gc.ca).
        </li>
      </ul>

      <h2>Quebec residents (Bill 25)</h2>
      <p>
        If your business operates in Quebec, you have additional rights under <em>Loi 25</em>:
        portability of personal information in a structured format, and the right to know
        which automated decisions affect you. Our data-export endpoint satisfies portability;
        contact us for automated-decision disclosures specific to your account.
      </p>

      <h2>Cookies</h2>
      <p>
        We use functional cookies (sign-in session) and a small set of analytics cookies. You
        can decline the analytics category via the banner on first visit and at any time
        thereafter.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions: <em>privacy@yourcompany.com</em> (update before launch).
      </p>
    </article>
  );
}
