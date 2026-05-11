"use server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export interface LeadInput {
  email: string;
  name?: string;
  company?: string;
  size?: string;
  vertical?: string;
  message?: string;
  source?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  _honey?: string;
}

export async function submitLead(input: LeadInput): Promise<void> {
  // Trim empty values so they land as NULL in Postgres rather than empty strings.
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && v.trim().length === 0) continue;
    if (v !== undefined && v !== null) cleaned[k] = v;
  }

  const res = await fetch(`${API_URL}/v1/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cleaned),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`submit failed: ${res.status} ${text.slice(0, 200)}`);
  }
}
