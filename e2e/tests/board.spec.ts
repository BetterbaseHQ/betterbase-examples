import { test, expect } from "@playwright/test";
import { appUrl, connectFromApp, registerUser, uniqueCreds, waitForEncrypted, waitForSynced } from "./fixtures";

/**
 * Board lifecycle: multi-collection defaults (board → columns) + created card,
 * anonymous → account adoption, account-side seeding, returning device.
 * Board is where the parent/child default complexity lives — if default
 * declarations, seedChildren, or the pristine-skip short-circuit regress,
 * these assertions fail.
 *
 */

const creds = uniqueCreds();

test.describe.serial("board lifecycle", () => {
  test("anonymous defaults + card survive connect (adoption + account-side seeding)", async ({
    page,
  }) => {
    await page.goto(appUrl("board"));

    // Local defaults seed on first visit
    await expect(page.getByText("My Board").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("To Do", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Done", { exact: true })).toBeVisible({ timeout: 30_000 });

    // Create a card
    await page.getByRole("button", { name: "Add card to To Do" }).click();
    await page.getByPlaceholder("Card title").fill("lifecycle card");
    // Enter moves focus to the optional description; a second Enter submits
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(page.getByText("lifecycle card")).toBeVisible({ timeout: 30_000 });

    // Register a fresh account, then connect from the app
    await registerUser(page, creds);
    await page.goto(appUrl("board"));
    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    // The card was adopted into the account, and the account seeded its own
    // defaults exactly once (pristine local defaults skip; board columns are
    // children seeded alongside)
    await expect(page.getByText("lifecycle card")).toBeVisible({ timeout: 30_000 });
    // Exactly one board (nav lists one entry per board) with both columns
    await expect(page.locator("nav").getByText("My Board", { exact: true })).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Rename column To Do" })).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Rename column Done" })).toHaveCount(1, { timeout: 30_000 });

    // Push settled before this context closes — else the returning
    // device races the bootstrap flush
    await waitForSynced(page);
    await page.waitForTimeout(2_000);
  });

  test("returning device downloads data without duplicating defaults", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(appUrl("board"));
    // Fresh device seeds local defaults before login
    await expect(page.getByText("My Board").first()).toBeVisible({ timeout: 30_000 });

    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    await expect(page.getByText("lifecycle card")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("nav").getByText("My Board", { exact: true })).toHaveCount(1, { timeout: 30_000 });

    await ctx.close();
  });
});
