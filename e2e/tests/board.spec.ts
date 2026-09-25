import { test, expect } from "@playwright/test";
import { appUrl, connectFromApp, registerUser, uniqueCreds, waitForEncrypted, waitForSynced } from "./fixtures";

/**
 * Board lifecycle: user-created board (with its default columns) + created
 * card, anonymous → account adoption, returning device. Nothing is ever
 * auto-created — a fresh workspace starts empty (docs/scaffold-data-design.md).
 */

const creds = uniqueCreds();

test.describe.serial("board lifecycle", () => {
  test("user-created board + card survive connect (adoption)", async ({ page }) => {
    await page.goto(appUrl("board"));

    // Empty workspace — the first-run empty state's CTA creates the
    // board (including the three workflow columns) via its modal.
    await page.getByRole("button", { name: "Create your first board" }).click();
    await page.getByRole("textbox", { name: "Board name", exact: true }).fill("Roadmap");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.locator("nav").getByText("Roadmap", { exact: true })).toHaveCount(1, {
      timeout: 30_000,
    });
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

    // The board (with columns) and card were adopted — exactly one board,
    // exactly one set of columns, nothing seeded alongside
    await expect(page.getByText("lifecycle card")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("nav").getByText("Roadmap", { exact: true })).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Rename column To Do" })).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Rename column Done" })).toHaveCount(1, {
      timeout: 30_000,
    });

    // Push settled before this context closes — else the returning
    // device races the bootstrap flush
    await waitForSynced(page);
    await page.waitForTimeout(2_000);
  });

  test("returning device downloads the board and card", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(appUrl("board"));
    // Nothing seeds on a fresh device — connect and download the account's data
    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    await expect(page.getByText("lifecycle card")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("nav").getByText("Roadmap", { exact: true })).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Rename column To Do" })).toHaveCount(1, {
      timeout: 30_000,
    });

    await ctx.close();
  });
});
