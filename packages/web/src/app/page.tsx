import { redirect } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) redirect("/sign-in");
  if (ctx.onboarding_step < 3) redirect("/onboarding");
  redirect("/inbox");
}
