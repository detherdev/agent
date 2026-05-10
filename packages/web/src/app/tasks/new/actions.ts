"use server";

import { getOrCreateWorkspace } from "@/lib/auth";
import { startTask } from "@/lib/api";

export async function startTaskAction(slug: string, input: Record<string, unknown>) {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) throw new Error("not signed in");
  return await startTask(ctx, slug, input);
}
