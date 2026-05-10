"use server";

import { revalidatePath } from "next/cache";
import { installCatalogJob } from "@/lib/api";

export async function installJob(pack: string, slug: string): Promise<void> {
  await installCatalogJob(pack, slug);
  revalidatePath("/jobs");
}
