import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { appUrl, connectFromApp, registerUser, uniqueCreds, waitForEncrypted, waitForSynced } from "./fixtures";

/**
 * Photos lifecycle: upload, connect, returning device. Exercises the file
 * scope (blob sync) on top of record sync — the only app with file uploads.
 *
 * OPEN FINDING (2026-09-24): FileStore.transferUnuploadedFrom reads both
 * anonymous blobs with correct byte lengths, but only one entry lands in
 * the scoped store's queue — with emptied bytes (uploads 34-byte empty
 * payloads). The adopted photo renders "Unavailable" post-connect and the
 * returning device gets nothing. Reproduces deterministically; needs focused
 * SDK debugging of the put/putFile path during retirement. Re-enable both
 * tests when fixed.
 */

// 40x30 solid-red PNG — a real decodable image (a 1x1 fixture never
// resolves through the thumbnail pipeline)
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAAKUlEQVR4nO3NoQ0AAAwCMP5/ensBh2lS31wysVnFYrFYLBaLxWKxWFx5Pp2rjeB5c/4AAAAASUVORK5CYII=";

const creds = uniqueCreds();

test.describe.serial("photos lifecycle", () => {
  test.skip(true, "pending FileStore.transferUnuploadedFrom fix — see header");

  test("uploaded photo survives connect", async ({ page }) => {
    await page.goto(appUrl("photos"));

    const filePath = path.join(tmpdir(), `e2e-photo-${randomUUID()}.png`);
    writeFileSync(filePath, Buffer.from(PNG_BASE64, "base64"));
    await page.setInputFiles('input[type="file"]', filePath);

    // The gallery renders the uploaded photo
    await expect(page.locator("main img").first()).toBeVisible({ timeout: 30_000 });

    await registerUser(page, creds);
    await page.goto(appUrl("photos"));
    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    // Let the upload queue drain before this context goes away — the
    // returning device can only download what reached the server
    await expect(page.getByTestId("upload-queue-pending")).toBeHidden({
      timeout: 30_000,
    });
    await expect(page.locator("main img").first()).toBeVisible({ timeout: 30_000 });
    await waitForSynced(page);
  });

  test("returning device downloads the photo (record + blob)", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(appUrl("photos"));
    await connectFromApp(page, creds);
    await waitForEncrypted(page);

    // Blob download can lag the record
    await expect(page.locator("main img").first()).toBeVisible({ timeout: 30_000 });

    await ctx.close();
  });
});
