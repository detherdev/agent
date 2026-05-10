"use server";

import { revalidatePath } from "next/cache";
import { getOrCreateWorkspace } from "@/lib/auth";
import { installCatalogJob, setOnboardingStep } from "@/lib/api";

export async function installJob(
  pack: string,
  slug: string,
  advanceOnboarding = false,
): Promise<void> {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) throw new Error("not signed in");

  await installCatalogJob(ctx, pack, slug);

  if (advanceOnboarding && ctx.onboarding_step < 1) {
    await setOnboardingStep(ctx, 1);
  }
  revalidatePath("/jobs");
  revalidatePath("/onboarding");
}
