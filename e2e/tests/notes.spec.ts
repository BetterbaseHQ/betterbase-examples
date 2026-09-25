import { test, expect } from "@playwright/test";
import { appUrl, connectFromApp, registerUser, uniqueCreds, waitForConnected, waitForSynced } from "./fixtures";

/**
 * Notes lifecycle: user-created notebook + note, anonymous → account
 * adoption, returning device. Nothing is ever auto-created — a fresh
 * workspace starts empty (docs/scaffold-data-design.md).
 */

const creds = uniqueCreds();

test.describe.serial("notes lifecycle", () => {
  test("user-created notebook + note survive connect (adoption)", async ({ page }) => {
    await page.goto(appUrl("notes"));

    // Empty workspace — create the notebook, then a note inside it
    await page.getByRole("textbox", { name: "New notebook name" }).fill("Journal");
    await page.getByRole("textbox", { name: "New notebook name" }).press("Enter");
    await expect(page.locator("nav").getByText("Journal", { exact: true })).toHaveCount(1, {
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "New note" }).click();
    await page.getByRole("textbox", { name: "Note title" }).fill("lifecycle note");
    await expect(page.getByText("lifecycle note")).toBeVisible({ timeout: 30_000 });

    await registerUser(page, creds);
    await page.goto(appUrl("notes"));
    await connectFromApp(page, creds);
    await waitForConnected(page);

    // The notebook and note were adopted; nothing seeded alongside them
    await expect(page.getByText("lifecycle note")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("nav").getByText("Journal", { exact: true })).toHaveCount(1, {
      timeout: 30_000,
    });

    // Push settled before this context closes — else the returning
    // device races the bootstrap flush
    await waitForSynced(page);
    await page.waitForTimeout(2_000);
  });

  test("returning device downloads the notebook and note", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(appUrl("notes"));
    await connectFromApp(page, creds);
    await waitForConnected(page);

    await expect(page.getByText("lifecycle note")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("nav").getByText("Journal", { exact: true })).toHaveCount(1, {
      timeout: 30_000,
    });

    await ctx.close();
  });
});
