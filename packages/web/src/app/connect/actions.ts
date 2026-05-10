"use server";

import { revalidatePath } from "next/cache";
import { getOrCreateWorkspace } from "@/lib/auth";
import { createConnectSession, setOnboardingStep } from "@/lib/api";

export async function startConnect(providers: string[]): Promise<{ sessionToken: string }> {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) throw new Error("not signed in");
  const session = await createConnectSession(ctx, providers);
  return { sessionToken: session.session_token };
}

export async function advanceAfterConnect(): Promise<void> {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) throw new Error("not signed in");
  if (ctx.onboarding_step < 2) await setOnboardingStep(ctx, 2);
  revalidatePath("/onboarding/connect");
}
