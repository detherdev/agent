"use server";

import { revalidatePath } from "next/cache";
import { getOrCreateWorkspace } from "@/lib/auth";
import { sendDiscoveryChatMessage } from "@/lib/api";

export async function sendDiscoveryMessage(draftId: string, text: string) {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) throw new Error("not signed in");
  const res = await sendDiscoveryChatMessage(ctx, draftId, text);
  revalidatePath(`/jobs/discover/${draftId}`);
  return res;
}
