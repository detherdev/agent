import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-medium text-neutral-300 hover:text-neutral-100">
            ← Back to app
          </Link>
          <nav className="flex gap-4 text-sm text-neutral-400">
            <Link href="/legal/terms" className="hover:text-neutral-200">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-neutral-200">Privacy</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">{children}</main>
    </div>
  );
}
