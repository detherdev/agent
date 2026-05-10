import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getOrCreateWorkspace } from "@/lib/auth";
import { getSpecDraft, listPendingApprovals } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { InstallButton } from "./InstallButton";

export const dynamic = "force-dynamic";

interface Spec {
  name?: string;
  goal?: string;
  trigger_kind?: string;
  trigger_config?: Record<string, unknown>;
  tool_config?: {
    connectors?: Array<{ slug: string }>;
    builtins?: string[];
    mcp_servers?: Array<{ slug: string }>;
    custom_tools?: unknown[];
  };
  guardrails?: {
    step_cap?: number;
    budget_usd?: number;
    redact_pii?: boolean;
    shadow_mode?: boolean;
    approvals?: Array<{ tool: string; when?: string; reason: string }>;
  };
  test_cases?: Array<{ name: string; input: unknown; rubric: string }>;
  model?: string;
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");
  const { id } = await params;

  const [draft, pending] = await Promise.all([
    getSpecDraft(ctx, id).catch(() => null),
    listPendingApprovals(ctx),
  ]);
  if (!draft) notFound();
  if (!draft.proposed_spec) {
    redirect(`/jobs/new/${id}`);
  }

  const spec = draft.proposed_spec as Spec;
  const alreadyInstalled = draft.status === "installed" && !!draft.installed_workflow_id;

  return (
    <div className="min-h-screen">
      <AppHeader pendingCount={pending.length} />

      <main className="mx-auto max-w-3xl px-6 py-8">
        <Link
          href={`/jobs/new/${id}`}
          className="text-sm text-neutral-500 hover:text-neutral-300"
        >
          ← Back to chat
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {spec.name ?? "Untitled"}
        </h1>
        {alreadyInstalled && (
          <p className="mt-2 text-sm text-emerald-300">
            Installed. <Link href={`/runs?workflow_id=${draft.installed_workflow_id}`}>See runs →</Link>
          </p>
        )}

        <Section title="What it does">
          <pre className="whitespace-pre-wrap rounded-md bg-neutral-950 p-4 text-xs text-neutral-300">
            {spec.goal ?? "(no goal set)"}
          </pre>
        </Section>

        <Section title="When it runs">
          <KV k="Trigger" v={spec.trigger_kind ?? "—"} />
          {spec.trigger_config && Object.keys(spec.trigger_config).length > 0 && (
            <pre className="mt-2 rounded-md bg-neutral-950 p-3 text-xs text-neutral-400">
              {JSON.stringify(spec.trigger_config, null, 2)}
            </pre>
          )}
        </Section>

        <Section title="What it can access">
          <KV
            k="Connectors"
            v={(spec.tool_config?.connectors ?? []).map((c) => c.slug).join(", ") || "—"}
          />
          <KV k="Built-ins" v={(spec.tool_config?.builtins ?? []).join(", ") || "—"} />
          {(spec.tool_config?.mcp_servers ?? []).length > 0 && (
            <KV
              k="MCP servers"
              v={(spec.tool_config?.mcp_servers ?? []).map((c) => c.slug).join(", ")}
            />
          )}
        </Section>

        <Section title="What it'll ask you first">
          {(spec.guardrails?.approvals ?? []).length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing — it acts on its own.</p>
          ) : (
            <ul className="space-y-2">
              {(spec.guardrails?.approvals ?? []).map((a, i) => (
                <li key={i} className="rounded-md border border-neutral-800 bg-neutral-950 p-3 text-sm">
                  <div className="font-mono text-xs text-amber-300">{a.tool}</div>
                  {a.when && <div className="mt-1 text-xs text-neutral-500">when: {a.when}</div>}
                  <div className="mt-1 text-neutral-200">{a.reason}</div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-500">
            <div>
              Step cap: <span className="text-neutral-300">{spec.guardrails?.step_cap ?? "—"}</span>
            </div>
            <div>
              Spend cap:{" "}
              <span className="text-neutral-300">
                ${(spec.guardrails?.budget_usd ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
        </Section>

        <Section title="Test cases">
          {(spec.test_cases ?? []).length === 0 ? (
            <p className="text-sm text-neutral-500">No test cases proposed.</p>
          ) : (
            <ul className="space-y-2">
              {(spec.test_cases ?? []).map((tc, i) => (
                <li key={i} className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                  <div className="text-sm font-medium text-neutral-100">{tc.name}</div>
                  <div className="mt-1 text-xs text-neutral-400">{tc.rubric}</div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-neutral-500">
            After install: run <code className="text-neutral-300">pnpm evals &lt;workflow_id&gt;</code>{" "}
            to grade these against the live agent in shadow mode.
          </p>
        </Section>

        <div className="mt-10 flex gap-3">
          {!alreadyInstalled && (
            <InstallButton draftId={id} />
          )}
          {alreadyInstalled && draft.installed_workflow_id && (
            <Link
              href={`/runs?workflow_id=${draft.installed_workflow_id}`}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              See runs
            </Link>
          )}
          <Link
            href={`/jobs/new/${id}`}
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900"
          >
            Keep editing
          </Link>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xs uppercase tracking-wide text-neutral-500">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="w-28 shrink-0 text-neutral-500">{k}</span>
      <span className="text-neutral-200">{v}</span>
    </div>
  );
}
