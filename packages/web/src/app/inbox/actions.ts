"use server";

import { revalidatePath } from "next/cache";
import { getOrCreateWorkspace } from "@/lib/auth";
import { decideApproval } from "@/lib/api";

export async function approve(approvalId: string): Promise<void> {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) throw new Error("not signed in");
  await decideApproval(ctx, approvalId, "approve");
  revalidatePath("/inbox");
}

export async function reject(approvalId: string, reason: string): Promise<void> {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) throw new Error("not signed in");
  await decideApproval(ctx, approvalId, "reject", reason);
  revalidatePath("/inbox");
}
