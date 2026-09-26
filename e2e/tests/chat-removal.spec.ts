import { test, expect } from "@playwright/test";
import {
  appUrl,
  connectFromApp,
  registerUser,
  uniqueCreds,
  waitForConnected,
  accountsHost,
} from "./fixtures";

/**
 * The first genuine two-user e2e in the suite: alice invites bob to a
 * conversation, then removes him. Removal is a full re-key — the assertions
 * pin all three faces of that property:
 *
 *   1. alice sees the re-key confirmation (epoch bumped past 1)
 *   2. alice's post-rotation writes keep working under the new key
 *   3. bob's conversation freezes live — notice replaces history and
 *      composer, and the post-rotation message never reaches him
 */

const aliceCreds = uniqueCreds();
const bobCreds = uniqueCreds();

const bobHandle = () => `${bobCreds.username}@${accountsHost}`;

test.describe("chat two-user removal", () => {
  test.setTimeout(240_000);

  test("removal re-keys the space and freezes the removed member's conversation", async ({
    browser,
  }) => {
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const alice = await aliceCtx.newPage();
    const bob = await bobCtx.newPage();

    await registerUser(alice, aliceCreds);
    await registerUser(bob, bobCreds);

    // Both connect first — the recipient's public key is only published
    // after their first sign-in, so inviting an account that never
    // connected fails the handle lookup.
    await alice.goto(appUrl("chat"));
    await connectFromApp(alice, aliceCreds);
    await waitForConnected(alice);

    await bob.goto(appUrl("chat"));
    await connectFromApp(bob, bobCreds);
    await waitForConnected(bob);
    await alice.getByRole("main").getByRole("button", { name: "New conversation" }).click();
    await alice.getByPlaceholder("user@domain").fill(bobHandle());
    await alice.getByRole("button", { name: "Start conversation" }).click();
    await expect(alice.getByPlaceholder("Type a message…")).toBeVisible({ timeout: 30_000 });

    // Bob accepts the invitation.
    await bob.locator('button[title="Accept"]').click();

    // Alice sends the pre-removal message (her push→pull also lands bob's
    // joined state in the member cache), and bob sees the history.
    await alice.getByPlaceholder("Type a message…").fill("before removal");
    await alice.getByRole("button", { name: "Send message" }).click();
    await expect(alice.getByText("before removal").first()).toBeVisible({ timeout: 30_000 });
    await expect(bob.getByText("before removal").first()).toBeVisible({ timeout: 60_000 });

    // Alice reloads before acting: the members panel only offers removal
    // for joined members, and the mount-time membership refresh is the
    // deterministic way to her freshest cache.
    await alice.reload();
    await waitForConnected(alice);
    await expect(alice.getByText("before removal").first()).toBeVisible({ timeout: 30_000 });
    await alice.getByTitle("Members").click();
    await alice.getByRole("button", { name: "Remove member" }).click();
    await alice.getByRole("button", { name: "Confirm remove member" }).click();
    const rekeyed = alice.getByTestId("rekeyed-notice");
    await expect(rekeyed).toBeVisible({ timeout: 60_000 });
    await expect(rekeyed).toHaveText(/no longer has access/);
    await expect(rekeyed).toHaveText(/Encryption epoch [2-9]\d*/);
    // Close the members popover — its dropdown portal intercepts clicks
    // on the composer beneath it.
    await alice.getByTitle("Members").click();

    // Post-rotation writes work for the remaining member (fresh key).
    await alice.getByPlaceholder("Type a message…").fill("after removal");
    await alice.getByRole("button", { name: "Send message" }).click();
    await expect(alice.getByText("after removal").first()).toBeVisible({ timeout: 30_000 });

    // Bob's side freezes live: the notice replaces messages and composer,
    // and the re-keyed message never arrives for him.
    await expect(bob.getByTestId("removed-space-notice")).toBeVisible({ timeout: 60_000 });
    await expect(bob.getByText("after removal")).toHaveCount(0);
    await expect(bob.getByPlaceholder("Type a message…")).toHaveCount(0);

    await aliceCtx.close();
    await bobCtx.close();
  });
});
