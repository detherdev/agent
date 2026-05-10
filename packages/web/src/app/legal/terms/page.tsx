export const metadata = { title: "Terms of Service" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <article className="prose prose-invert max-w-none text-neutral-200">
      <p className="text-xs uppercase tracking-wide text-neutral-500">
        Starter template — review with counsel before launch.
      </p>
      <h1>Terms of Service</h1>
      <p className="text-sm text-neutral-500">Last updated: insert date before launch.</p>

      <h2>1. Acceptance</h2>
      <p>
        By creating an account, you agree to these Terms. If you&apos;re accepting on behalf of a
        company, you confirm you have authority to bind it. These Terms are governed by the
        laws of the Province of Ontario and the federal laws of Canada applicable therein.
      </p>

      <h2>2. The service</h2>
      <p>
        We operate an AI workflow platform that runs Claude-powered agents on your behalf
        against systems you authorize. You retain ownership of all data you submit and all
        outputs the agents produce on your behalf.
      </p>

      <h2>3. Your responsibilities</h2>
      <ul>
        <li>
          You&apos;re responsible for the actions your agents take. We provide guardrails
          (approvals, spend caps, shadow mode); using them is your responsibility.
        </li>
        <li>
          You won&apos;t use the service to process content prohibited by law, defame, harass, or
          send unsolicited bulk email.
        </li>
        <li>
          You&apos;ll keep your authentication credentials confidential and notify us promptly of
          unauthorized access.
        </li>
      </ul>

      <h2>4. Billing</h2>
      <p>
        Plans, included usage, and overage pricing are listed on our pricing page. Fees are
        billed monthly via Stripe in advance; usage overages are billed in arrears. You may
        cancel any time; service continues through the end of the paid period.
      </p>

      <h2>5. Acceptable use</h2>
      <p>
        You won&apos;t reverse-engineer the service, attempt to bypass rate limits, or use it
        to train competing models. We may suspend an account that endangers the platform&apos;s
        integrity or other customers&apos; experience.
      </p>

      <h2>6. Warranties &amp; liability</h2>
      <p>
        The service is provided <em>as is</em>. To the maximum extent permitted by law, our
        aggregate liability is limited to the fees you paid in the twelve months preceding the
        event. We&apos;re not liable for indirect, incidental, or consequential damages.
      </p>
      <p>
        Agents are non-deterministic and may produce unexpected outputs. You acknowledge that
        approval gates and shadow mode exist for a reason.
      </p>

      <h2>7. Termination</h2>
      <p>
        You may delete your workspace from{" "}
        <a href="/settings/data" className="text-emerald-400">Settings → Data</a>. We retain
        data for 30 days post-deletion to handle accidental requests; after that it&apos;s
        permanently purged. We may terminate accounts that violate these Terms with notice
        where commercially reasonable.
      </p>

      <h2>8. Changes</h2>
      <p>
        We&apos;ll notify you of material changes by email at least 30 days before they take
        effect.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions: <em>contact@yourcompany.com</em> (update before launch).
      </p>
    </article>
  );
}
