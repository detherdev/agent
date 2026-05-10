/**
 * Migration runner.
 *
 * Lives inside the api package so it builds into packages/api/dist alongside
 * the server. Run on every deploy as Fly's release_command:
 *   node packages/api/dist/migrate.js
 *
 * Strategy:
 *   1. Ensure schema_migrations meta-table exists.
 *   2. On a fresh DB (no `workspaces` table yet), apply schema.sql once to
 *      bootstrap. Subsequent runs only apply migrations.
 *   3. Apply every *.sql in db/migrations/ in lex order that isn't already
 *      recorded, each in its own transaction.
 *
 * Idempotent. Safe to re-run.
 */

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getPool, query, withTx } from "runtime";

const ROOT = process.env.MIGRATIONS_ROOT ?? process.cwd();
const SCHEMA_PATH = resolve(ROOT, "db/schema.sql");
const MIGRATIONS_DIR = resolve(ROOT, "db/migrations");

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("migrate: DATABASE_URL not set");
    process.exit(1);
  }

  await query(`
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const appliedRes = await query<{ filename: string }>(
    `select filename from schema_migrations`,
  );
  const applied = new Set(appliedRes.rows.map((r) => r.filename));

  // Bootstrap a fresh DB. Detect by looking for a core table; if absent, apply
  // schema.sql once. This avoids running every migration sequentially on a
  // brand-new install — migrations are diffs against the current schema.sql.
  if (applied.size === 0) {
    const t = await query<{ count: string }>(
      `select count(*)::text as count from information_schema.tables
         where table_schema = 'public' and table_name = 'workspaces'`,
    );
    if (Number(t.rows[0]!.count) === 0) {
      console.log("→ fresh database; applying schema.sql");
      const schema = await readFile(SCHEMA_PATH, "utf8");
      await query(schema);
    }
  }

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  ${file} (already applied)`);
      continue;
    }
    const path = join(MIGRATIONS_DIR, file);
    const sql = await readFile(path, "utf8");

    await withTx(async (client) => {
      await client.query(sql);
      await client.query(`insert into schema_migrations (filename) values ($1)`, [file]);
    });
    console.log(`✓ applied ${file}`);
    appliedCount += 1;
  }

  console.log(`\nmigrate: ${appliedCount} new, ${files.length} total in tree.`);
  await getPool().end();
}

main().catch((err) => {
  console.error("migrate failed:", err);
  process.exit(1);
});
