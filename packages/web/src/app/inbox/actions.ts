"use server";

import { revalidatePath } from "next/cache";
import { decideApproval } from "@/lib/api";

export async function approve(approvalId: string): Promise<void> {
  await decideApproval(approvalId, "approve");
  revalidatePath("/inbox");
}

export async function reject(approvalId: string, reason: string): Promise<void> {
  await decideApproval(approvalId, "reject", reason);
  revalidatePath("/inbox");
}
