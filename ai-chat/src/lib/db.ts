import type { CollectionRead } from "betterbase/db";
import { createScopedAppDb } from "@betterbase/examples-shared";
import { threads, messages } from "./collections.js";

export { threads, messages } from "./collections.js";

export type Thread = CollectionRead<typeof threads>;
export type Message = CollectionRead<typeof messages>;

export const DB_NAME = "ai-chat";

/**
 * App database — the anonymous/local namespace by default, swapped to a
 * per-account namespace on sign-in via `openDatabaseForScope` (one account's
 * decrypted records are never visible to another account or to the
 * unauthenticated view). All scope-switching machinery lives in
 * `createScopedAppDb`; this module owns the live `db` binding — importers
 * must use `db` directly (capturing it pins one scope's instance past a
 * swap).
 */
const appDb = await createScopedAppDb({
  appName: DB_NAME,
  collections: [threads, messages],
  createWorker: () =>
    new Worker(new URL("./db-worker.ts", import.meta.url), {
      type: "module",
    }),
});

export let db = appDb.db;

/** Type of the swapped binding (queries/puts go through it). */

export function currentScopeDbName(): string | null {
  return appDb.currentScopeDbName();
}

export async function openDatabaseForScope(scopeKey: string | null): Promise<void> {
  db = await appDb.openForScope(scopeKey);
}

export function deleteAnonymousDatabase(): Promise<void> {
  return appDb.deleteAnonymousDatabase();
}
