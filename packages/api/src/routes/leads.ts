import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { query, log } from "runtime";

/**
 * Marketing-site lead capture. Public endpoint — no auth — because it's
 * called from /demo before anyone has an account.
 *
 * If LEADS_SLACK_WEBHOOK is set, every submission pings Slack so the
 * founder sees the request in real time.
 *
 * Light spam protection: simple honeypot field. Rate limiting per IP is
 * deferred to the slice that wires Upstash properly.
 */

const Body = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional(),
  company: z.string().min(1).max(200).optional(),
  size: z.enum(["1-5", "6-20", "21-50", "50+"]).optional(),
  vertical: z.string().min(1).max(80).optional(),
  message: z.string().max(4000).optional(),
  source: z.string().max(80).optional(),
  referrer: z.string().max(500).optional(),
  utm_source: z.string().max(80).optional(),
  utm_medium: z.string().max(80).optional(),
  utm_campaign: z.string().max(80).optional(),
  // Honeypot — real users won't fill this in; bots usually will.
  _honey: z.string().optional(),
});

export const leadsRouter = new Hono();

leadsRouter.post("/", zValidator("json", Body), async (c) => {
  const body = c.req.valid("json");

  // Honeypot trip → pretend success, log warn, write nothing.
  if (body._honey && body._honey.length > 0) {
    log.warn({ email: body.email }, "lead capture honeypot tripped");
    return c.json({ ok: true });
  }

  await query(
    `insert into leads (email, name, company, size, vertical, message, source, referrer,
                        utm_source, utm_medium, utm_campaign)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      body.email,
      body.name ?? null,
      body.company ?? null,
      body.size ?? null,
      body.vertical ?? null,
      body.message ?? null,
      body.source ?? "demo_form",
      body.referrer ?? null,
      body.utm_source ?? null,
      body.utm_medium ?? null,
      body.utm_campaign ?? null,
    ],
  );

  // Best-effort Slack ping for founders. Failure here is non-fatal.
  const webhook = process.env.LEADS_SLACK_WEBHOOK;
  if (webhook) {
    try {
      const text =
        `🎯 *New lead* — ${body.email}` +
        (body.company ? ` (${body.company})` : "") +
        (body.size ? `, ${body.size}` : "") +
        (body.vertical ? ` · ${body.vertical}` : "") +
        (body.message ? `\n> ${body.message.slice(0, 500)}` : "") +
        (body.source ? `\n_source: ${body.source}_` : "");
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      log.warn({ err: (err as Error).message }, "lead slack ping failed");
    }
  }

  return c.json({ ok: true });
});
