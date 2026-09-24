import { createDatabase, deleteDatabase, type CollectionRead } from "betterbase/db";
import { accountDbName, adoptLocalData } from "@betterbase/examples-shared";
import { notebooks, notes } from "./collections.js";

export { notebooks, notes } from "./collections.js";

export type Notebook = CollectionRead<typeof notebooks>;
export type Note = CollectionRead<typeof notes>;

/**
 * App database — a live binding swapped by `openDatabaseForScope`.
 *
 * The bare name is the anonymous/local namespace (retained deliberately:
 * offline-first data is never deleted on account switch). Each signed-in
 * account gets `name_<scope-hash>` so one account's decrypted records are
 * never visible to another account or to the unauthenticated view
 * (AUD-045). The App root remounts (React key) whenever the scope swaps,
 * so no component observes a database mid-swap.
 *
 * Caveat: importers must use `db` directly (live binding) — capturing it
 * (`const d = db`) pins one scope's instance past a swap.
 */
export const DB_NAME = "notes";

let openName = DB_NAME;

// Monotonic scope sequence: a superseded (slow) open must never assign
// underneath a newer scope that already became ready.
let scopeSequence = 0;

export let db = await createDatabase(DB_NAME, [notebooks, notes], {
  worker: new Worker(new URL("./db-worker.ts", import.meta.url), {
    type: "module",
  }),
});

/** Type of the swapped binding (queries/puts go through it). */
export type AppDb = typeof db;

/**
 * Suffix of the currently open scope, or null when anonymous. Lets
 * scope-bound resources (e.g. the photos FileStore) derive their own
 * per-account names synchronously after `openDatabaseForScope` resolves.
 */
export function currentScopeDbName(): string | null {
  return openName === DB_NAME ? null : openName;
}

/**
 * Open the database for the given account scope (null = anonymous). No-op
 * when that database is already open. Swaps the live `db` binding on
 * success, closes the displaced database (its worker and tab-coordinator
 * would otherwise leak per switch), and callers remount afterwards. A
 * superseded open is closed and discarded without assigning.
 */
export async function openDatabaseForScope(scopeKey: string | null): Promise<void> {
  const name = scopeKey === null ? DB_NAME : await accountDbName(DB_NAME, scopeKey);
  if (name === openName) return;
  const seq = ++scopeSequence;
  const next = await createDatabase(name, [notebooks, notes], {
    worker: new Worker(new URL("./db-worker.ts", import.meta.url), {
      type: "module",
    }),
  });
  if (seq !== scopeSequence) {
    // A newer scope superseded this open while it was in flight
    deferredClose(next);
    return;
  }
  const wasAnonymous = openName === DB_NAME;
  const prev = db;
  try {
    if (scopeKey !== null && wasAnonymous) {
      // Offline-first: the logged-out workspace merges into the first
      // account opened on this profile (idempotent, one-time per scope).
      // Runs before the swap commits so a failure keeps the previous
      // database current (openName unchanged) and a retry re-runs the merge.
      await adoptLocalData({
        appName: DB_NAME,
        scopeKey,
        anonymous: prev,
        target: next,
        collections: [notebooks, notes],
      });
    }
  } catch (err) {
    deferredClose(next);
    throw err;
  }
  db = next;
  openName = name;
  deferredClose(prev);
}

/**
 * Close a displaced database after a delay: OPFS handle release travels
 * through the worker asynchronously, and an immediate close contends with
 * a rapid reopen of the same name (the reopen then stalls on the handle).
 * The defer still reclaims the worker/coordinator/channel — just not in
 * the critical path of a scope switch.
 */
function deferredClose(displaced: AppDb): void {
  setTimeout(() => {
    displaced.close().catch(() => undefined);
  }, 10_000);
}

/**
 * Delete the anonymous (logged-out) database files. Used to retire the
 * namespace after its records were adopted into an account and synced —
 * the records' only home is the account database from then on.
 */
export function deleteAnonymousDatabase(): Promise<void> {
  return deleteDatabase(DB_NAME, {
    worker: new Worker(new URL("./db-worker.ts", import.meta.url), {
      type: "module",
    }),
  });
}
