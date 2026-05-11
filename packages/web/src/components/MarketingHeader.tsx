import Link from "next/link";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
          <span className="inline-block h-5 w-5 rounded-full bg-emerald-500" aria-hidden />
          <span>Your Assistant</span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-neutral-400 md:flex">
          <Link href="/for/bookkeepers" className="hover:text-neutral-100">
            For bookkeepers
          </Link>
          <Link href="/vs/zapier" className="hover:text-neutral-100">
            vs Zapier
          </Link>
          <Link href="/pricing" className="hover:text-neutral-100">
            Pricing
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/demo"
            className="hidden rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-900 sm:inline-block"
          >
            Book demo
          </Link>
          <Link
            href="/sign-in"
            className="rounded-md px-3 py-1.5 text-sm text-neutral-300 hover:text-neutral-100"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
