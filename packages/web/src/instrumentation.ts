// Next.js instrumentation hook: Sentry server / edge init lives in the
// sentry.*.config.ts files at the package root; this just routes them.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export async function onRequestError(...args: unknown[]) {
  const { captureRequestError } = await import("@sentry/nextjs");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (captureRequestError as any)(...args);
}
