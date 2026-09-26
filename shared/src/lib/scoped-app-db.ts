import {
  createDatabase,
  deleteDatabase,
  type CollectionDefHandle,
  type Database,
} from "betterbase/db";
import { accountDbName } from "./account-db.js";
import { adoptLocalData } from "./adopt-local-data.js";

export interface ScopedAppDbOptions {
  /** App name — the anonymous database name and the prefix of per-account names. */
  appName: string;
  collections: CollectionDefHandle[];
  /**
   * Builds a fresh worker for a database open (a worker is bound to one
   * database). Must be the inline `new Worker(new URL("./db-worker.ts",
   * import.meta.url), { type: "module" })` expression so bundlers can
   * statically wire the worker module — a URL passed as data cannot be.
   */
  createWorker: () => Worker;
  /**
   * Extra cleanup when the anonymous workspace is retired after adoption —
   * e.g. photos also deletes the default-name blob cache (logged-out blobs
   * are cached plaintext and must not linger).
   */
}

export interface ScopedAppDb {
  /** The currently open database. Re-read after `openForScope` resolves. */
  readonly db: Database;
  /**
   * Open the database for the given account scope (null = anonymous),
   * adopting anonymous data into the first account opened on this profile.
   * Returns the database that is current when the call settles — including
   * when superseded by a newer scope — so assigning the result to the
   * app's live `db` binding is always correct. Throws (without changing
   * the current database) if adoption fails.
   */
  openForScope(scopeKey: string | null): Promise<Database>;
  /** Delete the anonymous database files. */
  deleteAnonymousDatabase(): Promise<void>;
  /** Suffix of the current scope, or null when anonymous. */
  currentScopeDbName(): string | null;
}

/**
 * The scope-switching machinery every synced example app needs, written
 * once. Owns the live database binding, the monotonic scope sequence (a
 * superseded slow open must never assign underneath a newer scope),
 * anonymous→account adoption (before the swap commits, so a failure keeps
 * the previous database current and a retry re-runs the merge), deferred
 * close of displaced databases (OPFS handle release is asynchronous and an
 * immediate close contends with a rapid reopen), and anonymous retirement.
 *
 * The app keeps a thin wrapper module: it MUST own `export let db` — module
 * live bindings can't be re-exported from a factory — and assigns it from
 * `openForScope`'s result. Importers of `db` must use it directly
 * (`const d = db` pins one scope's instance past a swap).
 */
export async function createScopedAppDb(options: ScopedAppDbOptions): Promise<ScopedAppDb> {
  const { appName, collections, createWorker } = options;

  const openWorker = createWorker;

  let openName = appName;
  // Monotonic scope sequence: a superseded (slow) open must never assign
  // underneath a newer scope that already became ready.
  let scopeSequence = 0;
  let current = await createDatabase(appName, collections, { worker: openWorker() });

  /**
   * Close a displaced database after a delay: OPFS handle release travels
   * through the worker asynchronously, and an immediate close contends with
   * a rapid reopen of the same name (the reopen then stalls on the handle).
   * The defer still reclaims the worker/coordinator/channel — just not in
   * the critical path of a scope switch.
   */
  const deferredClose = (displaced: Database) => {
    setTimeout(() => {
      displaced.close().catch(() => undefined);
    }, 10_000);
  };

  const openForScope = async (scopeKey: string | null): Promise<Database> => {
    const name = scopeKey === null ? appName : await accountDbName(appName, scopeKey);
    if (name === openName) return current;
    const seq = ++scopeSequence;
    const next = await createDatabase(name, collections, { worker: openWorker() });
    if (seq !== scopeSequence) {
      // A newer scope superseded this open while it was in flight
      deferredClose(next);
      return current;
    }
    const wasAnonymous = openName === appName;
    const prev = current;
    try {
      if (scopeKey !== null && wasAnonymous) {
        // Offline-first: the logged-out workspace merges into the first
        // account opened on this profile (idempotent, one-time per scope).
        // Runs before the swap commits so a failure keeps the previous
        // database current (openName unchanged) and a retry re-runs the
        // merge.
        await adoptLocalData({
          appName,
          scopeKey,
          anonymous: prev,
          target: next,
          collections,
        });
      }
    } catch (err) {
      deferredClose(next);
      throw err;
    }
    if (seq !== scopeSequence) {
      // A newer scope committed while this open was adopting — committing
      // now would regress `current` underneath it (and leak its database,
      // which would never be closed). Discard this open instead.
      deferredClose(next);
      return current;
    }
    current = next;
    openName = name;
    deferredClose(prev);
    return current;
  };

  const deleteAnonymousDatabase = async (): Promise<void> => {
    await deleteDatabase(appName, { worker: openWorker() });
  };

  const currentScopeDbName = (): string | null => (openName === appName ? null : openName);

  return {
    get db() {
      return current;
    },
    openForScope,
    deleteAnonymousDatabase,
    currentScopeDbName,
  };
}
