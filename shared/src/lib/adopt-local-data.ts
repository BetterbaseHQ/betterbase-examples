/**
 * One-time adoption of anonymous (logged-out) records into an account's
 * database — and retirement of the anonymous namespace once those records
 * are safely synced.
 *
 * AUD-045 gave each signed-in account its own database (the bare app name
 * stayed the anonymous/local namespace), but no migration was written: on
 * first login the account database opened empty and the user's local data
 * silently disappeared from the UI (still on disk, recoverable only by
 * logging out). Offline-first means local data must survive connecting —
 * this helper merges the anonymous records into the account database
 * before the app renders (and before default-record seeding can observe
 * emptiness), so the first `flushAll` pushes them to the personal space.
 *
 * Adoption alone would leave a frozen duplicate of the data in the
 * anonymous namespace: logging out would show a stale copy the user has
 * no mental model for, and private records would linger on disk after
 * the user believes they live in their account. So the flow is two-phase:
 *
 * 1. adoptLocalData — merge records into the account database (at
 *    scope-open time), marker → "adopted".
 * 2. retireLocalData — once sync reaches phase "ready" (the bootstrap
 *    flushAll pushed the adopted records), delete the anonymous database
 *    files entirely, marker → "retired". Between the phases the duplicate
 *    exists but is never user-visible (logout only shows it if the user
 *    disconnects before their first successful sync). An interrupted
 *    retirement retries on the next login's ready transition; the merge
 *    is idempotent, so the interim is safe.
 *
 * Semantics:
 * - Records keep their ids: re-running the merge is idempotent (a put
 *   onto an existing id merges via CRDT instead of duplicating).
 * - The marker is per-(app, scope) in localStorage; any value other than
 *   "retired" means adoption happened and retirement is pending.
 * - Deletion goes through the SDK's deleteDatabase, which refuses to run
 *   while another tab holds the database open — retirement then simply
 *   retries later.
 * - Adoption copies records only. Cached file blobs (FileStore) are not
 *   migrated; apps with file fields should treat adopted-but-unsynced
 *   file references as missing until re-uploaded.
 */

import { mergeDatabaseRecords } from "betterbase/db";
import type { CollectionDefHandle } from "betterbase/db";
import type { Database } from "betterbase/db";
import { accountScopeHash } from "./account-db.js";

/** Marker value once the anonymous database files have been deleted. */
const MARKER_RETIRED = "retired";

async function adoptionMarkerKey(appName: string, scopeKey: string): Promise<string> {
  return `bb_local_adopted_${appName}_${await accountScopeHash(scopeKey)}`;
}

export interface AdoptLocalDataOptions {
  /** App namespace for the marker (conventionally the bare DB name). */
  appName: string;
  /** Account scope key (personal-space id or handle) being opened. */
  scopeKey: string;
  /** The still-open anonymous database, when it was the previously open one. */
  anonymous: Database | null;
  /** The freshly opened account database that receives the records. */
  target: Database;
  /** Collections whose records should be adopted. */
  collections: ReadonlyArray<CollectionDefHandle>;
}

/**
 * Merge all records of `collections` from the anonymous database into the
 * account database. Returns the number of records adopted (0 when there
 * is nothing to do or this scope already adopted).
 *
 * Throws on bulk errors — callers run this before marking the scope ready,
 * so a failed adoption surfaces as a scope-open error rather than a
 * silently empty app.
 */
export async function adoptLocalData(options: AdoptLocalDataOptions): Promise<number> {
  const { appName, scopeKey, anonymous, target, collections } = options;
  if (!anonymous) return 0;

  const marker = await adoptionMarkerKey(appName, scopeKey);
  const state = localStorage.getItem(marker);
  // "adopted" (pending retirement) blocks a re-run; a retired marker
  // re-arms adoption — the anonymous database was deleted, so anything in
  // a re-born one was created after retirement and must merge on the
  // next login (offline-first holds for every logout/login cycle).
  if (state !== null && state !== MARKER_RETIRED) return 0;

  const adopted = await mergeDatabaseRecords({
    source: anonymous,
    target,
    collections,
  });

  if (adopted > 0) {
    localStorage.setItem(marker, "adopted");
  }
  return adopted;
}

export interface RetireLocalDataOptions {
  /** App namespace used for the adoption marker (same as adoptLocalData). */
  appName: string;
  /** Account scope key that performed the adoption. */
  scopeKey: string;
  /**
   * Deletes the anonymous database files (e.g. the app's
   * `deleteAnonymousDatabase`, built on the SDK's `deleteDatabase`).
   */
  deleteAnonymousDb: () => Promise<void>;
}

/**
 * Delete the adopted anonymous database and mark the adoption retired.
 * Returns true when retirement ran (idempotent: false when there is
 * nothing to retire or it already happened).
 *
 * Call only after the adopting scope's sync reached phase "ready" — the
 * bootstrap flushAll has pushed the adopted records, so deleting the
 * source loses nothing. Throws when deletion fails (including the
 * open-in-another-tab refusal) — callers should log and rely on the next
 * login's ready transition to retry.
 */
export async function retireLocalData(options: RetireLocalDataOptions): Promise<boolean> {
  const { appName, scopeKey, deleteAnonymousDb } = options;
  const marker = await adoptionMarkerKey(appName, scopeKey);
  const state = localStorage.getItem(marker);
  if (state === null || state === MARKER_RETIRED) return false;

  await deleteAnonymousDb();
  localStorage.setItem(marker, MARKER_RETIRED);
  return true;
}
