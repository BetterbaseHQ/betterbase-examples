import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Lifecycle e2e for the example apps, run against the isolated `betterbase-e2e`
 * compose stack (accounts 25377, sync 25379 — see betterbase-dev/e2e/compose.yaml).
 *
 * Each app is served by its own vite dev server on a dedicated port with the
 * e2e accounts domain and OAuth client ID injected via env (process env wins
 * over the dev .env files, so the dev setup is untouched).
 *
 * One-time/repeatable setup: `pnpm setup` (registers OAuth clients, writes
 * .env.e2e). Requires the e2e stack: `just e2e-up` in betterbase-dev.
 */

function loadEnv(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(path.join(root, ".env.e2e"), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    throw new Error(
      "Missing e2e/.env.e2e — run `pnpm setup` first (requires the betterbase-e2e stack: `just e2e-up` in betterbase-dev)",
    );
  }
}

const env = loadEnv();

interface AppDef {
  name: string;
  port: number;
  clientId: string;
}

const appDefs: AppDef[] = [
  { name: "tasks", port: 25391, clientId: env.TASKS_CLIENT_ID },
  { name: "notes", port: 25392, clientId: env.NOTES_CLIENT_ID },
  { name: "photos", port: 25393, clientId: env.PHOTOS_CLIENT_ID },
  { name: "board", port: 25394, clientId: env.BOARD_CLIENT_ID },
  { name: "chat", port: 25395, clientId: env.CHAT_CLIENT_ID },
  { name: "passwords", port: 25396, clientId: env.PASSWORDS_CLIENT_ID },
];

for (const app of appDefs) {
  if (!app.clientId) throw new Error(`No client ID for "${app.name}" in .env.e2e — run \`pnpm setup\``);
}

export const accountsHost = env.ACCOUNTS_HOST ?? "localhost:25377";

const configuredWorkers = Number(process.env.PW_WORKERS ?? 1);

export default defineConfig({
  testDir: "./tests",
  // Each spec file is one app's serial lifecycle; files run concurrently.
  fullyParallel: false,
  workers: Number.isFinite(configuredWorkers) && configuredWorkers > 0 ? configuredWorkers : 1,
  retries: 0,
  // Sized for the worst lifecycle test (chat: registration + OAuth + E2EE
  // connect in one test) with headroom for a slow phase — each step's own
  // bounded waits sum, so a single stalled phase can overflow a tighter cap
  // and surface as an anonymous "timed out" with no step named
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  // The flake evidence chain: a recurrence keeps its trace (which await
  // was active) instead of disappearing with the terminal
  use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
  webServer: appDefs.map((app) => ({
    command: `pnpm dev --port ${app.port} --strictPort`,
    cwd: path.join(root, "..", app.name),
    url: `http://localhost:${app.port}`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      VITE_DOMAIN: accountsHost,
      VITE_OAUTH_CLIENT_ID: app.clientId,
    },
  })),
});
