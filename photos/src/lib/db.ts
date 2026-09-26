import { deleteFileCacheDatabase } from "betterbase/sync";
import type { CollectionRead } from "betterbase/db";
import { createScopedAppDb } from "@betterbase/examples-shared";
import { albums, photos } from "./collections.js";

export { albums, photos } from "./collections.js";

/** Records gain `_spaceId` once shared (spaces middleware). */
export type Album = CollectionRead<typeof albums> & { _spaceId?: string };
export type Photo = CollectionRead<typeof photos> & { _spaceId?: string };

export const DB_NAME = "photos";

/**
 * App database — the anonymous/local namespace by default, swapped to
 * `photos_<scope-hash>` per signed-in account by `openDatabaseForScope`
 * (one account's decrypted records are never visible to another account
 * or to the unauthenticated view, AUD-045). All the scope-switching
 * machinery lives in `createScopedAppDb`; this module exists because the
 * live `db` binding must be owned by app code — importers must use `db`
 * directly (capturing it pins one scope's instance past a swap).
 *
 * `currentScopeDbName` feeds the per-account FileStore naming (scoped
 * blob caches), and retirement also deletes the anonymous blob cache:
 * logged-out blobs are cached plaintext and must not linger after their
 * records were adopted into an account.
 */
const appDb = await createScopedAppDb({
  appName: DB_NAME,
  collections: [albums, photos],
  createWorker: () =>
    new Worker(new URL("./db-worker.ts", import.meta.url), {
      type: "module",
    }),
  retireAnonymousExtras: deleteFileCacheDatabase,
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
