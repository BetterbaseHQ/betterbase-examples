import { test, expect } from "@playwright/test";
import { appUrl, connectFromApp, registerUser, uniqueCreds, waitForEncrypted, waitForSynced } from "./fixtures";

/**
 * Passwords lifecycle: created entry, connect, returning device. No default
 * data — the thin slice is entry CRUD + sync round-trip.
 */

const creds = uniqueCreds();

test.describe.serial("passwords lifecycle", () => {
  test("created entry survives connect", async ({ page }) => {
    await page.goto(appUrl("passwords"));

    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Add", exact: true }).click();
    // Role+exact avoids the generator's "Password length"/"Generated password"
    await page.getByRole("textbox", { name: "Site", exact: true }).fill("example.com");
    await page.getByRole("textbox", { name: "Username", exact: true }).fill("e2e-user");
    await page.getByRole("textbox", { name: "Password", exact: true }).fill("TestPassword123!");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("example.com")).toBeVisible({ timeout: 30_000 });

    await registerUser(page, creds);
    await page.goto(appUrl("passwords"));
    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    await expect(page.getByText("example.com")).toBeVisible({ timeout: 30_000 });

    // Push settled before this context closes — else the returning
    // device races the bootstrap flush
    await waitForSynced(page);
    await page.waitForTimeout(2_000);
  });

  test("returning device downloads the entry", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(appUrl("passwords"));
    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    await expect(page.getByText("example.com")).toBeVisible({ timeout: 30_000 });

    await ctx.close();
  });
});
