/**
 * Sentry initialization for the Node services (api / worker / trigger-worker).
 *
 * No-ops when SENTRY_DSN is unset (e.g. local dev). Import this file at the
 * very top of each process entry point so instrumentation is in place before
 * any other code runs.
 */

import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE ?? undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? "0"),
    // Don't send default PII (IPs, user emails, request bodies).
    sendDefaultPii: false,
  });
}

export { Sentry };
