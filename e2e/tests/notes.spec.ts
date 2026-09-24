import { test, expect } from "@playwright/test";
import { appUrl, connectFromApp, registerUser, uniqueCreds, waitForEncrypted, waitForSynced } from "./fixtures";

/**
 * Notes lifecycle: anonymous note (no default notebook by design — notes
 * seeds "My Notebook" only after the full bootstrap sync completes), adoption
 * of the anonymous note, account-side notebook seeding, returning device.
 *
 */

const creds = uniqueCreds();

test.describe.serial("notes lifecycle", () => {
  test("anonymous note survives connect; notebook seeds account-side", async ({ page }) => {
    await page.goto(appUrl("notes"));

    // Anonymous state: no notebook yet (seeding is gated on bootstrap-ready),
    // but note creation works — the note lands in All Notes
    await page.getByRole("button", { name: "New note" }).click();
    await page.getByRole("textbox", { name: "Note title" }).fill("lifecycle note");
    await expect(page.getByText("lifecycle note")).toBeVisible({ timeout: 30_000 });

    await registerUser(page, creds);
    await page.goto(appUrl("notes"));
    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    // The anonymous note was adopted; the default notebook seeded exactly once
    await expect(page.getByText("lifecycle note")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("nav").getByText("My Notebook", { exact: true })).toHaveCount(1, { timeout: 30_000 });

    // Push settled before this context closes — else the returning
    // device races the bootstrap flush
    await waitForSynced(page);
    await page.waitForTimeout(2_000);
  });

  test("returning device downloads the note and seeds exactly one notebook", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(appUrl("notes"));
    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    await expect(page.getByText("lifecycle note")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("nav").getByText("My Notebook", { exact: true })).toHaveCount(1, { timeout: 30_000 });

    await ctx.close();
  });
});
