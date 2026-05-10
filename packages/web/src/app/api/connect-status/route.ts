import { NextResponse } from "next/server";
import { getOrCreateWorkspace } from "@/lib/auth";
import { listRequiredProviders } from "@/lib/api";

// Polled by the connect tiles every 2s while a Nango modal is open. Server
// component data fetching can't refresh under an open modal, so we proxy.
export async function GET() {
  const ctx = await getOrCreateWorkspace();
  if (!ctx) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const providers = await listRequiredProviders(ctx);
  return NextResponse.json(providers);
}
