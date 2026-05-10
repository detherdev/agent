import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Your assistant</h1>
      <p className="mt-4 text-neutral-400">
        It handles the work; you stay in the loop on anything that matters.
      </p>
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <Link
          href="/jobs"
          className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-5 py-4 hover:bg-neutral-900"
        >
          <div className="text-base font-medium">Pick a job</div>
          <div className="text-sm text-neutral-500">Browse what your assistant can handle.</div>
        </Link>
        <Link
          href="/inbox"
          className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-5 py-4 hover:bg-neutral-900"
        >
          <div className="text-base font-medium">Inbox</div>
          <div className="text-sm text-neutral-500">Approve or reject anything waiting on you.</div>
        </Link>
      </div>
    </main>
  );
}
