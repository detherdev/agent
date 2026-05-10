#!/usr/bin/env tsx
/**
 * Install round-trip verification.
 *
 * Asserts the pack-install path actually writes the right rows to Postgres.
 * Run AFTER `docker compose up -d postgres` (or against any DATABASE_URL).
 *
 * Steps:
 *   1. Run schema.sql + every db/migrations/*.sql
 *   2. Insert (or upsert) demo workspace + user
 *   3. Install the bookkeeping pack
 *   4. Assert workflows + test_cases rows match expectations
 *
 * Exits 0 on success, non-zero on any assertion failure.
 */

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  query,
  installWorkflow,
  listPackJobs,
  readPackJob,
} from "runtime";

// `pnpm verify` runs from the repo root via package.json's script entry.
const REPO_ROOT = resolve(process.cwd());
const PACK_DIR = join(REPO_ROOT, "packs", "bookkeeping");
const DEMO_WORKSPACE_ID = process.env.DEMO_WORKSPACE_ID ?? "11111111-1111-1111-1111-111111111111";
const DEMO_USER_ID = process.env.DEMO_USER_ID ?? "22222222-2222-2222-2222-222222222222";

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failures += 1;
  }
}

async function applySchemaAndMigrations(): Promise<void> {
  console.log("• Applying schema.sql and migrations…");
  const schema = await readFile(join(REPO_ROOT, "db", "schema.sql"), "utf8");
  await query(schema);

  const migrationsDir = join(REPO_ROOT, "db", "migrations");
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = await readFile(join(migrationsDir, f), "utf8");
    try {
      await query(sql);
    } catch (err) {
      // Migrations are idempotent in this scaffold but a few statements may
      // throw on re-run; surface them but keep going.
      console.warn(`  ! migration ${f}: ${(err as Error).message}`);
    }
  }
}

async function ensureDemoTenant(): Promise<void> {
  console.log("• Ensuring demo workspace + user…");
  await query(
    `insert into workspaces (id, name) values ($1, 'demo')
       on conflict (id) do nothing`,
    [DEMO_WORKSPACE_ID],
  );
  await query(
    `insert into users (id, clerk_user_id, email) values ($1, 'demo', 'demo@example.com')
       on conflict (id) do nothing`,
    [DEMO_USER_ID],
  );
  await query(
    `insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')
       on conflict (workspace_id, user_id) do nothing`,
    [DEMO_WORKSPACE_ID, DEMO_USER_ID],
  );
}

async function clearWorkspaceWorkflows(): Promise<void> {
  await query(`delete from workflows where workspace_id = $1`, [DEMO_WORKSPACE_ID]);
}

async function installBookkeepingPack(): Promise<void> {
  console.log(`• Installing pack at ${PACK_DIR}…`);
  const slugs = (await listPackJobs(PACK_DIR)).map((j) => j.slug);
  for (const slug of slugs) {
    const job = await readPackJob(PACK_DIR, slug);
    const result = await installWorkflow({ workspaceId: DEMO_WORKSPACE_ID, ...job.spec });
    console.log(`    → installed "${job.name}" (${result.test_case_count} test cases)`);
  }
}

async function runAssertions(): Promise<void> {
  console.log("• Asserting…");

  const wfs = await query<{ id: string; name: string; trigger_kind: string; tool_config: unknown }>(
    `select id, name, trigger_kind, tool_config from workflows
       where workspace_id = $1 and archived = false
       order by name`,
    [DEMO_WORKSPACE_ID],
  );

  assert(wfs.rows.length === 2, `expected 2 workflows installed, got ${wfs.rows.length}`);

  const byName = new Map(wfs.rows.map((r) => [r.name, r]));
  const invoice = byName.get("Invoice → QuickBooks");
  const ar = byName.get("Chase late payments");
  assert(!!invoice, "Invoice → QuickBooks workflow exists");
  assert(!!ar, "Chase late payments workflow exists");

  if (invoice) {
    assert(invoice.trigger_kind === "email", "invoice workflow trigger_kind == email");
    const tc = invoice.tool_config as { connectors: Array<{ slug: string }> };
    const slugs = tc.connectors.map((c) => c.slug).sort();
    assert(
      JSON.stringify(slugs) === JSON.stringify(["gmail", "quickbooks"]),
      `invoice workflow connectors == [gmail, quickbooks] (got ${JSON.stringify(slugs)})`,
    );
  }

  if (ar) {
    assert(ar.trigger_kind === "schedule", "AR workflow trigger_kind == schedule");
  }

  const tcCount = await query<{ n: string }>(
    `select count(*)::text as n from test_cases tc
       join workflows w on w.id = tc.workflow_id
      where w.workspace_id = $1`,
    [DEMO_WORKSPACE_ID],
  );
  const totalTC = Number(tcCount.rows[0]!.n);
  assert(totalTC >= 12, `>= 12 test cases across the two workflows (got ${totalTC})`);

  // Approval guardrail integrity: each workflow has at least one approval rule.
  const guard = await query<{ guardrails: { approvals?: unknown[] } }>(
    `select guardrails from workflows where workspace_id = $1`,
    [DEMO_WORKSPACE_ID],
  );
  for (const r of guard.rows) {
    assert(
      Array.isArray(r.guardrails.approvals) && r.guardrails.approvals.length > 0,
      `workflow has at least one approval rule`,
    );
  }
}

async function main(): Promise<void> {
  console.log("Verifying install round-trip\n");
  await applySchemaAndMigrations();
  await ensureDemoTenant();
  await clearWorkspaceWorkflows();
  await installBookkeepingPack();
  await runAssertions();

  console.log();
  if (failures > 0) {
    console.error(`FAIL: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("OK");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
