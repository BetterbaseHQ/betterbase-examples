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
 * Two-user removal for per-record sharing: alice shares one vault entry
 * with bob, then removes him. The victim's secret view is replaced by the
 * re-key notice, alice's post-rotation update never decrypts on bob's
 * device, and bob can still delete his local plaintext copy.
 */

const aliceCreds = uniqueCreds();
const bobCreds = uniqueCreds();

const bobHandle = () => `${bobCreds.username}@${accountsHost}`;

test.describe("passwords two-user removal", () => {
  test.setTimeout(240_000);

  test("removed member loses the secret view; post-rotation updates never arrive", async ({
    browser,
  }) => {
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const alice = await aliceCtx.newPage();
    const bob = await bobCtx.newPage();

    await registerUser(alice, aliceCreds);
    await registerUser(bob, bobCreds);

    // Both connect first — the recipient's public key is only published
    // after their first sign-in, so sharing to an account that never
    // connected fails the handle lookup.
    await alice.goto(appUrl("passwords"));
    await connectFromApp(alice, aliceCreds);
    await waitForConnected(alice);

    await bob.goto(appUrl("passwords"));
    await connectFromApp(bob, bobCreds);
    await waitForConnected(bob);
    await alice.getByRole("button", { name: "Add your first password" }).click();
    await alice.getByLabel("Site").fill("Vault Bank");
    await alice.getByLabel("URL").fill("https://vault.example");
    await alice.getByLabel("Username").fill("alice");
    await alice.getByRole("textbox", { name: "Password" }).fill("rotated-secret-1");
    await alice.getByRole("button", { name: "Create" }).click();

    // Creating lands on the list — open the entry's detail view.
    await alice.getByRole("button", { name: "Open Vault Bank" }).click();

    // Share it with bob (detail view → Share modal).
    await alice.getByRole("button", { name: "Share" }).first().click();
    await alice.getByLabel("User handle").fill(bobHandle());
    await alice.getByRole("dialog").getByRole("button", { name: "Share" }).click();
    await expect(alice.getByTitle("Members")).toBeVisible({ timeout: 30_000 });

    // Bob accepts, opens the entry, and sees the secret.
    await bob.locator('button[title="Accept"]').click();
    await bob.getByRole("button", { name: "Open Vault Bank" }).click();
    // Pre-removal access is real: bob's copy decrypts with the space key.
    await expect(bob.getByRole("textbox", { name: "Password" })).toHaveValue(
      "rotated-secret-1",
      { timeout: 30_000 },
    );

    // Alice reloads before acting: the members panel only offers removal
    // for joined members, and the mount-time membership refresh is the
    // deterministic way to her freshest cache.
    await alice.reload();
    await waitForConnected(alice);
    await alice.getByRole("button", { name: "Open Vault Bank" }).click();
    await expect(alice.getByTitle("Members")).toBeVisible({ timeout: 30_000 });

    // Alice removes bob — the panel confirms the re-key with the epoch.
    await alice.getByTitle("Members").click();
    await alice.getByRole("button", { name: "Remove member" }).click();
    await alice.getByRole("button", { name: "Confirm remove member" }).click();
    const rekeyed = alice.getByTestId("rekeyed-notice");
    await expect(rekeyed).toBeVisible({ timeout: 60_000 });
    await expect(rekeyed).toHaveText(/no longer has access/);
    await expect(rekeyed).toHaveText(/Encryption epoch [2-9]\d*/);
    // Close the members popover — its dropdown portal intercepts clicks.
    await alice.getByTitle("Members").click();

    // Alice rotates the secret — a write under the fresh key.
    await alice.getByRole("button", { name: "Edit" }).click();
    await alice.getByRole("textbox", { name: "Password" }).fill("rotated-secret-2");
    await alice.getByRole("button", { name: "Save" }).click();
    await expect(alice.getByRole("textbox", { name: "Password" })).toHaveValue(
      "rotated-secret-2",
      { timeout: 30_000 },
    );

    // Bob's open detail view flips to the re-key notice — no secret, and
    // the rotated value never arrives on his device.
    const notice = bob.getByTestId("removed-space-notice");
    await expect(notice).toBeVisible({ timeout: 60_000 });
    await expect(notice).toHaveText(/You no longer have access to this password/);
    await expect(bob.getByRole("textbox", { name: "Password" })).toHaveCount(0);

    // Bob deletes his local copy; the entry leaves his device.
    await bob.getByTestId("delete-local-copy").click();
    await expect(bob.getByText("No passwords yet")).toBeVisible({ timeout: 30_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });
});
