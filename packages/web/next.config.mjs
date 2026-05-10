import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // standalone output is what Vercel and self-hosted Docker both consume.
  output: "standalone",
};

// Sentry wrapper is a no-op until SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT
// are set in CI (for source-map upload). The runtime SDK works regardless.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  // Skip source-map upload when we don't have the auth token; build still succeeds.
  dryRun: !process.env.SENTRY_AUTH_TOKEN,
});
