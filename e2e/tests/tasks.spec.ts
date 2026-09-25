import { test, expect } from "@playwright/test";
import { appUrl, connectFromApp, registerUser, uniqueCreds, waitForEncrypted, waitForSynced } from "./fixtures";

/**
 * Tasks lifecycle: user-created list + todo, anonymous → account adoption,
 * returning device. Nothing is ever auto-created — a fresh workspace starts
 * empty and every device renders exactly what the account holds (see
 * docs/scaffold-data-design.md).
 */

const creds = uniqueCreds();

test.describe.serial("tasks lifecycle", () => {
  test("user-created list + todo survive connect (adoption)", async ({ page }) => {
    await page.goto(appUrl("tasks"));

    // Empty workspace — no scaffolding is created. Build the list via the UI.
    await page.getByRole("textbox", { name: "New list name" }).fill("Errands");
    await page.getByRole("textbox", { name: "New list name" }).press("Enter");
    await expect(page.locator("nav").getByText("Errands", { exact: true })).toHaveCount(1, {
      timeout: 30_000,
    });

    await page.getByPlaceholder("Add a task...").fill("lifecycle todo");
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("lifecycle todo")).toBeVisible({ timeout: 30_000 });

    await registerUser(page, creds);
    await page.goto(appUrl("tasks"));
    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    await expect(page.getByText("lifecycle todo")).toBeVisible({ timeout: 30_000 });
    // Exactly one copy of the adopted list — nothing seeded alongside it
    await expect(page.locator("nav").getByText("Errands", { exact: true })).toHaveCount(1, {
      timeout: 30_000,
    });
    // Push settled before this context closes — else the returning
    // device races the bootstrap flush. The badge can flicker Synced in
    // the gap between a mutation and its scheduled sync start, so a
    // short settle covers what the badge may not track.
    await waitForSynced(page);
    await page.waitForTimeout(2_000);
  });

  test("returning device downloads the list and todo; nothing new is created", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(appUrl("tasks"));
    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    await expect(page.getByText("lifecycle todo")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("nav").getByText("Errands", { exact: true })).toHaveCount(1, {
      timeout: 30_000,
    });

    await ctx.close();
  });
});
