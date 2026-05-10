import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-neutral-900">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <span className="inline-block h-4 w-4 rounded-full bg-emerald-500" aria-hidden />
          <span>Built in Canada · Data hosted in YYZ</span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-400">
          <Link href="/pricing" className="hover:text-neutral-100">Pricing</Link>
          <Link href="/legal/terms" className="hover:text-neutral-100">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-neutral-100">Privacy</Link>
          <a href="mailto:hello@yourdomain.com" className="hover:text-neutral-100">Contact</a>
        </nav>
      </div>
    </footer>
  );
}
