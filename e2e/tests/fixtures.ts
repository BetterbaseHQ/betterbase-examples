import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/**
 * Shared lifecycle fixtures for the example-app e2e specs.
 *
 * Everything runs against the isolated betterbase-e2e stack: accounts on
 * localhost:25377 (CAPTCHA disabled, SMTP_DEV_MODE prints verification codes
 * to the container log). Each spec file registers one fresh account — every
 * test therefore exercises a virgin account, which is the exact surface where
 * default-seeding and adoption bugs have escaped before.
 */

export const ACCOUNTS_CONTAINER = process.env.E2E_ACCOUNTS_CONTAINER ?? "betterbase-e2e-accounts-1";
export const ACCOUNTS_URL = process.env.E2E_ACCOUNTS_URL ?? "http://localhost:25377";

/** Dev-server port per app (mirrors playwright.config.ts). */
const APP_PORTS: Record<string, number> = {
  tasks: 25391,
  notes: 25392,
  photos: 25393,
  board: 25394,
  chat: 25395,
  passwords: 25396,
};

export function appUrl(app: string): string {
  const port = APP_PORTS[app];
  if (!port) throw new Error(`Unknown app "${app}"`);
  return `http://localhost:${port}/`;
}

export interface UserCredentials {
  username: string;
  email: string;
  password: string;
}

let userCounter = 0;

/** Unique credentials per call; username satisfies ^[a-z0-9_]{3,32}$. */
export function uniqueCreds(): UserCredentials {
  const ts = Date.now().toString(36).slice(-8);
  const pid = process.pid.toString(36).slice(-4);
  const seq = (++userCounter).toString(36).slice(-3);
  const rnd = randomUUID().replace(/-/g, "").slice(0, 6);
  const id = `e2e_${ts}_${pid}_${seq}_${rnd}`;
  return { username: id, email: `${id}@test.local`, password: "TestPassword123!" };
}

// ---------------------------------------------------------------------------
// Registration — navigates the accounts web UI directly
// ---------------------------------------------------------------------------

/** Poll the accounts container log for the email verification code. */
async function pollVerificationCode(email: string, timeoutMs = 20_000): Promise<string> {
  const pattern = new RegExp(
    `To: ${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?Your verification code is: (\\d{6})`,
  );
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const logs = execSync(`docker logs --since 5m ${ACCOUNTS_CONTAINER}`, {
        encoding: "utf8",
        timeout: 5_000,
      });
      const match = logs.match(pattern);
      if (match) return match[1];
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Verification code not found in logs for ${email} within ${timeoutMs}ms`);
}

/**
 * Register a new account through the accounts signup UI. Navigates away from
 * the current page; local (anonymous) app state in this browser context is
 * unaffected.
 */
export async function registerUser(page: Page, creds: UserCredentials): Promise<void> {
  await page.goto(`${ACCOUNTS_URL}/signup`);
  await page.waitForSelector("#username");
  await page.fill("#username", creds.username);
  await page.fill("#email", creds.email);
  await page.click('button:has-text("Continue")');

  // Six-digit verification code — SMTP_DEV_MODE logs it to the container log.
  const firstDigit = page.locator('input[aria-label="Digit 1 of 6"]');
  await firstDigit.waitFor({ timeout: 10_000 });
  const code = await pollVerificationCode(creds.email);
  await firstDigit.focus();
  for (const d of code) {
    await page.keyboard.type(d);
  }

  await page.waitForSelector("#password", { timeout: 30_000 });
  await page.fill("#password", creds.password);
  await page.fill("#confirmPassword", creds.password);
  await page.click('button:has-text("Create account")');

  // Recovery acknowledgement
  await page.waitForURL("**/recovery-setup**", { timeout: 15_000 });
  const checkbox = page.locator('input[type="checkbox"]');
  await checkbox.waitFor({ timeout: 10_000 });
  await checkbox.check();
  await page.click('button:has-text("Continue")');
  await page.waitForFunction(
    () => !window.location.pathname.includes("recovery-setup"),
    undefined,
    { timeout: 10_000 },
  );
}

// ---------------------------------------------------------------------------
// Connect — app → OAuth → back to the app
// ---------------------------------------------------------------------------

/**
 * From an app page (already loaded), open the connect modal and complete the
 * OAuth flow: login (the account exists — use registerUser first) and consent.
 * Ends back on the app origin; callers then wait for the encrypted state.
 */
export async function connectFromApp(page: Page, creds: UserCredentials): Promise<void> {
  const appOrigin = new URL(page.url()).origin;

  // Entry points differ: most apps open a "Connect Sync" modal first; chat's
  // sign-in gate starts the OAuth redirect directly
  const signIn = page.getByRole("button", { name: "Sign in", exact: true });
  if (await signIn.isVisible().catch(() => false)) {
    await signIn.click();
  } else {
    await page.getByRole("button", { name: "Connect Sync" }).click();
    await page.getByRole("button", { name: "Continue with Betterbase Account" }).click();
  }

  // The redirect should leave the app origin immediately; under dev-server
  // load the click can land before hydration wires the handler — retry once
  for (let attempt = 0; attempt < 2; attempt++) {
    const url = new URL(page.url());
    if (url.host !== new URL(appOrigin).host) break;
    await page.waitForTimeout(5_000);
    if (new URL(page.url()).host === new URL(appOrigin).host) {
      const again = page.getByRole("button", { name: "Continue with Betterbase Account" });
      if (await again.isVisible().catch(() => false)) await again.click();
    }
  }

  // The OAuth flow redirects to accounts. The consent page may render then
  // bounce to reauth (root key not in memory); loop until Allow is reachable.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForSelector('#password, button:has-text("Allow")', { timeout: 30_000 });

    const passwordField = page.locator("#password");
    if (await passwordField.isVisible().catch(() => false)) {
      const usernameField = page.locator("#username");
      const isReadonly = (await usernameField.getAttribute("readonly")) !== null;
      if (!isReadonly && (await usernameField.isVisible().catch(() => false))) {
        await usernameField.fill(creds.username);
      }
      await passwordField.fill(creds.password);
      await page.locator('button[type="submit"]').click();
      await page.waitForFunction(() => !window.location.pathname.includes("/login"), undefined, {
        timeout: 30_000,
      });
      continue;
    }
    break;
  }

  await page.locator('button:has-text("Allow")').click();

  // Back on the app with the auth code
  await page.waitForURL(`${appOrigin}/**`, { timeout: 30_000 });
}

/** Wait for the app to finish connecting (encryption indicator). */
export async function waitForEncrypted(page: Page): Promise<void> {
  await expect(page.getByText("Encrypted").first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Wait for the sync engine to settle: "Synced" = phase ready (the bootstrap
 * flushAll pushed everything, including adopted records) and no work in
 * flight. This is the deterministic "safe to close the tab / open a second
 * device" signal — never replace it with a sleep.
 */
export async function waitForSynced(page: Page): Promise<void> {
  await expect(page.getByTestId("sync-status-synced")).toBeVisible({ timeout: 30_000 });
}
