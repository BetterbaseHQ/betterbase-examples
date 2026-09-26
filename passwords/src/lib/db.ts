import type { CollectionRead } from "betterbase/db";
import { createScopedAppDb } from "@betterbase/examples-shared";
import { entries } from "./collections.js";

export { entries } from "./collections.js";

export type Entry = CollectionRead<typeof entries>;

export const DB_NAME = "passwords";

/**
 * App database — the anonymous/local namespace by default, swapped to
 * `passwords_<scope-hash>` per signed-in account by `openDatabaseForScope`
 * (one account's decrypted records are never visible to another account
 * or to the unauthenticated view, AUD-045). All the scope-switching
 * machinery lives in `createScopedAppDb`; this module exists because the
 * live `db` binding must be owned by app code — importers must use `db`
 * directly (capturing it pins one scope's instance past a swap).
 */
const appDb = await createScopedAppDb({
  appName: DB_NAME,
  collections: [entries],
  createWorker: () =>
    new Worker(new URL("./db-worker.ts", import.meta.url), {
      type: "module",
    }),
});

export let db = appDb.db;

/** Type of the swapped binding (queries/puts go through it). */
export type AppDb = typeof db;

export function currentScopeDbName(): string | null {
  return appDb.currentScopeDbName();
}

export async function openDatabaseForScope(scopeKey: string | null): Promise<void> {
  db = await appDb.openForScope(scopeKey);
}

export function deleteAnonymousDatabase(): Promise<void> {
  return appDb.deleteAnonymousDatabase();
}
