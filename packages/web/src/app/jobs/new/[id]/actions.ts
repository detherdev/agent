"use server";

import { revalidatePath } from "next/cache";
import { getOrCreateWorkspace } from "@/lib/auth";
import { sendSpecDraftMessage, installSpecDraft } from "@/lib/api";

export async function sendMessage(draftId: string, text: string) {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) throw new Error("not signed in");
  const res = await sendSpecDraftMessage(ctx, draftId, text);
  revalidatePath(`/jobs/new/${draftId}`);
  return res;
}

export async function install(draftId: string) {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) throw new Error("not signed in");
  return await installSpecDraft(ctx, draftId);
}
