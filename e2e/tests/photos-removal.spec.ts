import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  appUrl,
  connectFromApp,
  registerUser,
  uniqueCreds,
  waitForConnected,
  accountsHost,
} from "./fixtures";

/**
 * Two-user removal for blob-backed sharing: alice shares an album with bob,
 * then removes him. The victim's gallery freezes behind the re-key notice,
 * a photo uploaded after the rotation never decrypts on bob's device, and
 * delete-local-copy removes the records *and* his cached blobs.
 *
 * This is also the cross-user file-sync proof: bob downloads the shared
 * album's blobs from the shared space (per-space file routing), and
 * alice's post-rotation upload lands in the re-keyed space.
 */

// 40x30 solid-red PNG — a real decodable image (a 1x1 fixture never
// resolves through the thumbnail pipeline)
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAAKUlEQVR4nO3NoQ0AAAwCMP5/ensBh2lS31wysVnFYrFYLBaLxWKxWFx5Pp2rjeB5c/4AAAAASUVORK5CYII=";

const aliceCreds = uniqueCreds();
const bobCreds = uniqueCreds();

const bobHandle = () => `${bobCreds.username}@${accountsHost}`;

test.describe("photos two-user removal", () => {
  test.setTimeout(240_000);

  test("removed member's album freezes; post-rotation uploads never arrive", async ({
    browser,
  }) => {
    const photo1 = path.join(tmpdir(), `e2e-photo-${randomUUID()}.png`);
    const photo2 = path.join(tmpdir(), `e2e-photo-${randomUUID()}.png`);
    writeFileSync(photo1, Buffer.from(PNG_BASE64, "base64"));
    writeFileSync(photo2, Buffer.from(PNG_BASE64, "base64"));

    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const alice = await aliceCtx.newPage();
    const bob = await bobCtx.newPage();

    await registerUser(alice, aliceCreds);
    await registerUser(bob, bobCreds);

    // Both connect first — the recipient's public key is only published
    // after their first sign-in, so sharing to an account that never
    // connected fails the handle lookup.
    await alice.goto(appUrl("photos"));
    await connectFromApp(alice, aliceCreds);
    await waitForConnected(alice);

    await bob.goto(appUrl("photos"));
    await connectFromApp(bob, bobCreds);
    await waitForConnected(bob);

    // Alice creates an album and uploads into it.
    await alice.getByPlaceholder("New album...").fill("Trip 2026");
    await alice.keyboard.press("Enter");
    await alice.getByText("Trip 2026").click();
    await alice.setInputFiles('input[type="file"]', photo1);
    await expect(alice.locator("main img").first()).toBeVisible({ timeout: 30_000 });
    // Let the blob reach the server — bob can only download what landed.
    await expect(alice.getByTestId("upload-queue-pending")).toBeHidden({ timeout: 30_000 });

    // Share the album with bob (gallery header → Share modal).
    await alice.getByRole("button", { name: "Share" }).first().click();
    await alice.getByLabel("User handle").fill(bobHandle());
    await alice.getByRole("dialog").getByRole("button", { name: "Share" }).click();
    await expect(alice.getByTitle("Members")).toBeVisible({ timeout: 30_000 });

    // Bob accepts and opens the album — pre-removal access is real: the
    // record *and* the blob decrypt with the space key. (Scoped to the
    // photo's alt — the members avatar also renders an <img> in main.)
    // The sidebar churns while the invitation acceptance settles, so a
    // click can land on a detaching row: assert the album view actually
    // engaged (its header carries the Members control) and re-click if
    // not — bob's photo would otherwise render in "All Photos" and the
    // freeze would never surface.
    await bob.locator('button[title="Accept"]').click();
    await bob.getByText("Trip 2026").waitFor({ timeout: 30_000 });
    await expect(async () => {
      if ((await bob.getByTitle("Members").count()) === 0) {
        await bob.getByText("Trip 2026").click();
      }
      await expect(bob.getByTitle("Members")).toBeVisible();
    }).toPass({ timeout: 20_000 });
    await expect(bob.getByRole("img", { name: /e2e-photo/ })).toBeVisible({ timeout: 60_000 });

    // Alice reloads before acting: the members panel only offers removal
    // for joined members, and the mount-time membership refresh is the
    // deterministic way to her freshest cache.
    await alice.reload();
    await waitForConnected(alice);
    await alice.getByText("Trip 2026").click();
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

    // Alice uploads after the rotation — a blob under the fresh key.
    await alice.setInputFiles('input[type="file"]', photo2);
    await expect(alice.getByRole("img", { name: /e2e-photo/ })).toHaveCount(2, {
      timeout: 30_000,
    });
    await expect(alice.getByTestId("upload-queue-pending")).toBeHidden({ timeout: 30_000 });

    // Bob's open album freezes — no grid, no dropzone, and the post-
    // rotation photo never arrives on his device.
    const notice = bob.getByTestId("removed-space-notice");
    await expect(notice).toBeVisible({ timeout: 60_000 });
    await expect(notice).toHaveText(/You no longer have access to this album/);
    await expect(bob.getByText("Drop photos here")).toHaveCount(0);
    await expect(bob.getByRole("img", { name: /e2e-photo/ })).toHaveCount(0);

    // Bob deletes his local copy: records and cached blobs leave his
    // device, and the album leaves his sidebar.
    await bob.getByTestId("delete-local-copy").click();
    await expect(bob.getByText("Trip 2026")).toHaveCount(0, { timeout: 30_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });
});
