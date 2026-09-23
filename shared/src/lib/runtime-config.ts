/**
 * Runtime configuration for deployed example apps.
 *
 * Two configuration sources, in precedence order:
 *
 * 1. **Container runtime config** — the examples image entrypoint writes a
 *    `config.js` next to each app's `index.html` that sets
 *    `window.__BETTERBASE__` (deployment-specific accounts domain + OAuth
 *    client IDs). Used when the apps are served from the unified examples
 *    container (path-based hosting, e.g. `https://examples.yourdomain.com/tasks/`).
 *
 * 2. **Vite env vars** — `VITE_DOMAIN` / `VITE_OAUTH_CLIENT_ID` from each
 *    app's `.env` file, provisioned by `just setup-example` in the dev
 *    environment (each app on its own port at `/`).
 *
 * `redirectUri` follows Vite's `BASE_URL` so OAuth callbacks land on the
 * app's mounted path (`https://examples.yourdomain.com/tasks/` in the container,
 * `http://localhost:5381/` in dev).
 *
 * Build note: this module ships as tsup-built ESM inside the shared
 * package's dist, but `import.meta.env` references are resolved by the
 * *consuming app's* Vite build (which bundles the dist). If the shared
 * build tool or app bundler ever changes, re-verify that substitution —
 * `import.meta.env?.X` must never reach the browser unresolved.
 */

/** Shape of the `window.__BETTERBASE__` object set by `config.js`. */
export interface BetterbaseRuntimeConfig {
  /** Accounts server hostname (e.g. "accounts.example.com" or "localhost:5377"). */
  domain: string;
  /** OAuth client IDs keyed by app id (e.g. "tasks"). */
  apps: Record<string, { clientId: string }>;
}

declare global {
  interface Window {
    __BETTERBASE__?: BetterbaseRuntimeConfig;
  }
}

const DEV_DOMAIN = "localhost:5377";

/** The deployment's runtime config, or undefined in the dev environment. */
export function runtimeConfig(): BetterbaseRuntimeConfig | undefined {
  return typeof window !== "undefined" ? window.__BETTERBASE__ : undefined;
}

/** Accounts server hostname: runtime config, then Vite env, then dev default. */
export function runtimeDomain(): string {
  return runtimeConfig()?.domain ?? import.meta.env?.VITE_DOMAIN ?? DEV_DOMAIN;
}

/** OAuth client ID for an app: runtime config, then Vite env, then empty. */
export function runtimeClientId(appId: string): string {
  return runtimeConfig()?.apps?.[appId]?.clientId ?? import.meta.env?.VITE_OAUTH_CLIENT_ID ?? "";
}

/**
 * OAuth redirect URI for the current app mount point. Derived from Vite's
 * BASE_URL so it is correct both at `/` (dev) and at `/<app>/` (container).
 */
export function runtimeRedirectUri(): string {
  return new URL(import.meta.env?.BASE_URL ?? "/", window.location.origin).href;
}

/** Resolved configuration for an app's `AuthProvider`. */
export function appAuthConfig(appId: string): {
  domain: string;
  clientId: string;
  redirectUri: string;
} {
  return {
    domain: runtimeDomain(),
    clientId: runtimeClientId(appId),
    redirectUri: runtimeRedirectUri(),
  };
}

/**
 * Per-app session/keys storage prefix for `AuthProvider`. Apps hosted on
 * one origin must not share a prefix: a shared prefix means a shared
 * localStorage session slot, so each app would silently reuse whichever
 * app's OAuth grant was stored last (wrong client, wrong personal space,
 * refresh rejected with a client_id mismatch).
 */
export function appStoragePrefix(appId: string): string {
  return `betterbase_session_${appId}_`;
}
