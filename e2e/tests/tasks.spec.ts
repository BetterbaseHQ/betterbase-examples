import { test, expect } from "@playwright/test";
import { appUrl, connectFromApp, registerUser, uniqueCreds, waitForEncrypted, waitForSynced } from "./fixtures";

/**
 * Tasks lifecycle: default list ("My Tasks") + a created todo, adoption,
 * account-side seeding, returning device. Single-collection default — the
 * simplest declaration shape.
 *
 */

const creds = uniqueCreds();

test.describe.serial("tasks lifecycle", () => {
  test("anonymous default list + todo survive connect (adoption + seeding)", async ({ page }) => {
    await page.goto(appUrl("tasks"));

    await expect(page.getByText("My Tasks").first()).toBeVisible({ timeout: 30_000 });

    await page.getByPlaceholder("Add a task...").fill("lifecycle todo");
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("lifecycle todo")).toBeVisible({ timeout: 30_000 });

    await registerUser(page, creds);
    await page.goto(appUrl("tasks"));
    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    await expect(page.getByText("lifecycle todo")).toBeVisible({ timeout: 30_000 });
    // Exactly one default list after the account seeds its own
    await expect(page.locator("nav").getByText("My Tasks", { exact: true })).toHaveCount(1, { timeout: 30_000 });
    // Push settled before this context closes — else the returning
    // device races the bootstrap flush. The badge can flicker Synced in
    // the gap between a mutation and its scheduled sync start, so a
    // short settle covers what the badge may not track.
    await waitForSynced(page);
    await page.waitForTimeout(2_000);
  });

  test("returning device downloads the todo without duplicating the default list", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(appUrl("tasks"));
    await expect(page.getByText("My Tasks").first()).toBeVisible({ timeout: 30_000 });

    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    await expect(page.getByText("lifecycle todo")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("nav").getByText("My Tasks", { exact: true })).toHaveCount(1, { timeout: 30_000 });

    await ctx.close();
  });
});
