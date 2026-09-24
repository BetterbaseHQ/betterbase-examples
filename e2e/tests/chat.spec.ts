import { test, expect } from "@playwright/test";
import { appUrl, connectFromApp, registerUser, uniqueCreds, waitForEncrypted, waitForSynced } from "./fixtures";

/**
 * Chat lifecycle: chat requires an account before any conversation UI
 * renders ("Sign in to start chatting"), so unlike the other apps the
 * connect happens first. A self-conversation (own handle) is the solo case:
 * create → send → returning device downloads it.
 */

const creds = uniqueCreds();

const ownHandle = () => `${creds.username}@localhost:25377`;

test.describe.serial("chat lifecycle", () => {
  test("conversation + message survive on reconnect", async ({ page }) => {
    await registerUser(page, creds);

    // Anonymous state: chat gates the UI behind sign-in
    await page.goto(appUrl("chat"));
    await expect(page.getByText("Sign in to start chatting")).toBeVisible({ timeout: 30_000 });

    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    // Self-conversation + message
    await page.getByRole("button", { name: "New conversation" }).click();
    await page.getByPlaceholder("user@domain").fill(ownHandle());
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

    await page.goto(appUrl("chat"));
    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    await expect(page.getByText("lifecycle message").first()).toBeVisible({ timeout: 60_000 });

    await ctx.close();
  });
});
