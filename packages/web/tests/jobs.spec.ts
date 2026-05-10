import { test, expect, request } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const WORKSPACE_ID = process.env.DEMO_WORKSPACE_ID ?? "11111111-1111-1111-1111-111111111111";

/**
 * E2E for the job picker.
 *
 * NOTE — currently disabled by default. Once Clerk auth was added, /jobs is
 * behind a sign-in wall, so this test needs:
 *   1. Clerk dev keys set in env (so sign-in works)
 *   2. @clerk/testing wired up to bypass UI sign-in for tests
 *
 * Re-enable by removing the test.skip wrapper below once that's in place.
 *
 * Pre-req for the API-only assertion path: `pnpm verify` has run, which
 * guarantees the workspace exists and the bookkeeping pack is installed.
 */

test.describe.skip("job picker (needs Clerk test setup)", () => {
  test("job picker lists at least 2 jobs", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.getByRole("heading", { name: /what should I handle/i })).toBeVisible();

    const cards = page.getByTestId(/^job-card-/);
    await expect(cards).toHaveCount(2, { timeout: 10_000 });
    await expect(page.getByText("Invoice → QuickBooks")).toBeVisible();
    await expect(page.getByText("Chase late payments")).toBeVisible();
  });

  test("install flow adds a workflow and reflects 'Installed' on refresh", async ({ page }) => {
    await page.goto("/jobs");

    const arCard = page.getByTestId("job-card-ar-chasing");
    await expect(arCard).toBeVisible();

    const button = arCard.getByTestId("install-ar-chasing");
    if (await button.isVisible()) {
      await button.click();
      await expect(arCard.getByText(/already added|installed/i)).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(arCard.getByText(/installed/i)).toBeVisible();
    }

    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/v1/workflows?workspace_id=${WORKSPACE_ID}`);
    expect(res.status()).toBe(200);
    const list = (await res.json()) as Array<{ name: string }>;
    expect(list.some((w) => w.name === "Chase late payments")).toBe(true);
  });
});

// Always-on smoke tests: hit the API directly, no browser auth required.
test.describe("API surface", () => {
  test("catalog endpoint lists jobs for the demo workspace", async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/v1/catalog?workspace_id=${WORKSPACE_ID}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { jobs: Array<{ name: string; pack: string }> };
    expect(body.jobs.length).toBeGreaterThanOrEqual(2);
    expect(body.jobs.some((j) => j.name === "Invoice → QuickBooks")).toBe(true);
    expect(body.jobs.some((j) => j.name === "Chase late payments")).toBe(true);
  });
});
