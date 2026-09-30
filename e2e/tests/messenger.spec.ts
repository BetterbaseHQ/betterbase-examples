import { test, expect } from "@playwright/test";
import { appUrl, connectFromApp, registerUser, uniqueCreds, waitForConnected, waitForSynced } from "./fixtures";

/**
 * Messenger lifecycle: Messenger requires an account before any conversation UI
 * renders ("Sign in to start chatting"), so unlike the other apps the
 * connect happens first. A self-conversation (own handle) is the solo case:
 * create → send → returning device downloads it.
 */

const creds = uniqueCreds();

test.describe.serial("messenger lifecycle", () => {
  test("conversation + message survive on reconnect", async ({ page }) => {
    await registerUser(page, creds);

    // Anonymous state: messenger gates the UI behind sign-in
    await page.goto(appUrl("messenger"));
    await expect(page.getByText("Sign in to start chatting")).toBeVisible({ timeout: 30_000 });

    await connectFromApp(page, creds);
    await waitForConnected(page);

    // Self-conversation + message. Short handle only — the domain is
    // inferred from the signed-in user's handle (pinned: name-only entry works).
    // The first-run CTA in the main pane (the sidebar "+" has the same name)
    await page.getByRole("main").getByRole("button", { name: "New conversation" }).click();
    await page.getByLabel("Chat with").fill(creds.username);
    await page.getByRole("button", { name: "Start conversation" }).click();

    await expect(page.getByPlaceholder("Type a message…")).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder("Type a message…").fill("lifecycle message");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("lifecycle message").first()).toBeVisible({ timeout: 30_000 });
    // Push settled before this context closes — else the returning
    // device races the bootstrap flush. The badge can flicker Synced in
    // the gap between a mutation and its scheduled sync start, so a short
    // settle covers the shared-space upload the badge may not track.
    await waitForSynced(page);
    await page.waitForTimeout(2_000);
  });

  test("returning device downloads the conversation and message", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(appUrl("messenger"));
    await connectFromApp(page, creds);
    await waitForConnected(page);

    await expect(page.getByText("lifecycle message").first()).toBeVisible({ timeout: 60_000 });

    await ctx.close();
  });
});
