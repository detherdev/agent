import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  ensureWorkspace,
  installWorkflow,
  isJobInstalled,
  listPackJobs,
  readPackJob,
  query,
  type PackJobMetadata,
} from "runtime";

const PACKS_DIR = process.env.PACKS_DIR ?? resolve(process.cwd(), "packs");

interface CatalogJob extends PackJobMetadata {
  pack: string;
  installed: boolean;
  installed_workflow_id?: string;
}

export const catalogRouter = new Hono();

catalogRouter.get("/", async (c) => {
  const workspaceId = c.get("workspace_id");

  const packs = await listPacks();
  const jobs: CatalogJob[] = [];

  const installedRows = await query<{ id: string; name: string }>(
    `select id, name from workflows where workspace_id = $1 and archived = false`,
    [workspaceId],
  );
  const installedByName = new Map(installedRows.rows.map((r) => [r.name, r.id]));

  for (const pack of packs) {
    const meta = await listPackJobs(join(PACKS_DIR, pack));
    for (const m of meta) {
      const installedId = installedByName.get(m.name);
      jobs.push({ ...m, pack, installed: !!installedId, installed_workflow_id: installedId });
    }
  }

  return c.json({ packs_dir: PACKS_DIR, jobs });
});

const InstallBody = z.object({
  pack: z.string().min(1),
  slug: z.string().min(1),
});

catalogRouter.post("/install", zValidator("json", InstallBody), async (c) => {
  const { pack, slug } = c.req.valid("json");
  const workspaceId = c.get("workspace_id");

  await ensureWorkspace(workspaceId);

  const job = await readPackJob(join(PACKS_DIR, pack), slug);

  if (await isJobInstalled(workspaceId, job.name)) {
    return c.json({ error: "already installed", job_name: job.name }, 409);
  }

  const result = await installWorkflow({ workspaceId, ...job.spec });
  return c.json(
    {
      workflow_id: result.workflow_id,
      test_case_count: result.test_case_count,
      job_name: job.name,
    },
    201,
  );
});

async function listPacks(): Promise<string[]> {
  try {
    const entries = await readdir(PACKS_DIR);
    const packs: string[] = [];
    for (const e of entries) {
      const s = await stat(join(PACKS_DIR, e));
      if (s.isDirectory()) packs.push(e);
    }
    return packs;
  } catch (err) {
    console.error(`PACKS_DIR not readable: ${PACKS_DIR}`, err);
    return [];
  }
}
