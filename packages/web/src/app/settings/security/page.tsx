import Link from "next/link";

export const dynamic = "force-dynamic";

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-base font-semibold text-neutral-100">Two-factor authentication</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Manage MFA on your account via your{" "}
          <Link href="/settings/profile" className="text-emerald-400 underline">
            account settings
          </Link>
          . We recommend enabling an authenticator app — it&apos;s the single biggest thing
          you can do to protect your workspace.
        </p>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-base font-semibold text-neutral-100">Connected accounts</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Each connection (Gmail, QuickBooks, etc.) is OAuth-scoped to a single workspace and
          revocable at any time. Tokens are stored by our provider Nango — we never see the
          raw access tokens.
        </p>
        <Link
          href="/connect"
          className="mt-4 inline-block rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Manage connections →
        </Link>
      </section>

      <section className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30 p-6 text-sm text-neutral-400">
        <div className="font-medium text-neutral-300">Coming soon</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Workspace-wide MFA enforcement (require all members to have MFA on)</li>
          <li>Audit log of who did what — every approval, install, and connection change</li>
          <li>SSO via SAML / Google Workspace (Enterprise plan)</li>
        </ul>
      </section>
    </div>
  );
}
