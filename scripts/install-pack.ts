#!/usr/bin/env tsx
/**
 * Install a vertical pack into a workspace.
 *
 * Usage:
 *   tsx scripts/install-pack.ts <workspace_id> <pack_dir>
 *   tsx scripts/install-pack.ts <workspace_id> <pack_dir> <slug>   # one job
 */

import { resolve } from "node:path";
import { ensureWorkspace, listPackJobs, readPackJob, installWorkflow } from "runtime";

async function main(): Promise<void> {
  const [workspaceId, packDirArg, onlySlug] = process.argv.slice(2);
  if (!workspaceId || !packDirArg) {
    console.error("usage: tsx scripts/install-pack.ts <workspace_id> <pack_dir> [slug]");
    process.exit(1);
  }

  const packDir = resolve(packDirArg);
  await ensureWorkspace(workspaceId);

  const slugs = onlySlug ? [onlySlug] : (await listPackJobs(packDir)).map((j) => j.slug);
  if (slugs.length === 0) {
    console.error(`no workflow .json files found in ${packDir}`);
    process.exit(1);
  }

  for (const slug of slugs) {
    const job = await readPackJob(packDir, slug);
    const result = await installWorkflow({ workspaceId, ...job.spec });
    console.log(`installed ${job.name}  →  ${result.workflow_id}  (${result.test_case_count} test cases)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
