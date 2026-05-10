import { defineConfig } from "@playwright/test";

/**
 * E2E config.
 *
 * Prerequisites for `pnpm test:e2e`:
 *   1. Postgres + Redis running:        docker compose up -d
 *   2. DB seeded with bookkeeping pack: pnpm verify
 *   3. ANTHROPIC_API_KEY set            (only required if a test triggers a run)
 *
 * The config starts the API and web dev servers itself (reusing them if you
 * already have them running locally).
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter api dev",
      url: "http://localhost:3001/health",
      cwd: "../../",
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/agent",
        REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
        PACKS_DIR: process.env.PACKS_DIR ?? "",
      },
    },
    {
      command: "pnpm --filter web dev",
      url: "http://localhost:3000",
      cwd: "../../",
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        API_URL: "http://localhost:3001",
        DEMO_WORKSPACE_ID:
          process.env.DEMO_WORKSPACE_ID ?? "11111111-1111-1111-1111-111111111111",
        DEMO_USER_ID:
          process.env.DEMO_USER_ID ?? "22222222-2222-2222-2222-222222222222",
      },
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
