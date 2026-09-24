/**
 * Account-scoped database naming for the example apps (AUD-045).
 *
 * Apps used one fixed database name per app, so a prior account's
 * decrypted records stayed readable by any later account on the same
 * browser profile — and by the unauthenticated view. Database identity is
 * the isolation boundary: the bare name stays the anonymous/local
 * namespace (offline-first data is deliberately retained — never deleted),
 * and each signed-in account gets its own database derived from a stable
 * account key.
 */

/** Minimal session surface needed to derive an account key. */
export interface AccountScopeSource {
  getPersonalSpaceId(): string | null;
  getHandle(): string | null;
}

/**
 * Stable per-account key: the personal space ID (sync identity, stable
 * across refreshes and devices). Falls back to the handle, then to a
 * constant for auth-only sessions that carry neither.
 */
export function accountScopeKey(session: AccountScopeSource): string {
  return session.getPersonalSpaceId() ?? session.getHandle() ?? "authenticated";
}

/** Short, filesystem-safe scope digest (never embeds the raw identifier). */
export async function accountScopeHash(scopeKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(scopeKey);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  // base36 of the first 8 bytes — 64 bits of entropy, plenty for a local name
  let value = 0n;
  for (let i = 0; i < 8; i++) value = (value << 8n) | BigInt(view[i]!);
  return value.toString(36);
}

/** Database name for an authenticated account: `base_<hash>` (the name
 * charset is alphanumeric/underscore/hyphen — no `::`). */
export async function accountDbName(base: string, scopeKey: string): Promise<string> {
  return `${base}_${await accountScopeHash(scopeKey)}`;
}
