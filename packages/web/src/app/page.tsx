export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Agent Workflow Platform</h1>
      <p className="mt-4 text-neutral-400">
        Each workflow is a Claude agent loop with tools, memory, guardrails, test cases, and an
        approval queue. Builder UI ships in phase 2.
      </p>
      <ul className="mt-10 space-y-2 text-sm text-neutral-300">
        <li>POST /v1/workflows — create</li>
        <li>POST /v1/runs — start a run</li>
        <li>GET /v1/runs/:id/turns — inspect a run</li>
        <li>GET /v1/approvals?workspace_id=... — pending approvals</li>
      </ul>
    </main>
  );
}
