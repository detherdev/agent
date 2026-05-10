import { test, expect, request } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const WORKSPACE_ID = process.env.DEMO_WORKSPACE_ID ?? "11111111-1111-1111-1111-111111111111";

/**
 * E2E for the job picker.
 *
 * Pre-req: `pnpm verify` has run, which guarantees the workspace exists and
 * the bookkeeping pack is installable. The tests are tolerant of either an
 * empty workspace (cards show "Add") or a previously-seeded one (cards show
 * "Installed") so they're idempotent across reruns.
 */
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

  // Pick a card that's not yet installed.
  const arCard = page.getByTestId("job-card-ar-chasing");
  await expect(arCard).toBeVisible();

  const button = arCard.getByTestId("install-ar-chasing");
  if (await button.isVisible()) {
    await button.click();
    // Server action revalidates the page; either label flips to "Already added"
    // or the button re-renders disabled.
    await expect(arCard.getByText(/already added|installed/i)).toBeVisible({ timeout: 10_000 });
  } else {
    // Already installed from a prior run — assert the badge is present.
    await expect(arCard.getByText(/installed/i)).toBeVisible();
  }

  // Confirm via API that the workflow truly exists in the DB.
  const ctx = await request.newContext();
  const res = await ctx.get(`${API_URL}/v1/workflows?workspace_id=${WORKSPACE_ID}`);
  expect(res.status()).toBe(200);
  const list = (await res.json()) as Array<{ name: string }>;
  expect(list.some((w) => w.name === "Chase late payments")).toBe(true);
});
