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
 *    scope-open time), marker → "adopted". The marker is written ONLY
 *    when at least one record merged: an empty anonymous database must
 *    not mark the scope, or local data created after that login would
 *    never adopt (the no-marker path is what re-runs the merge).
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
 * - Records keep their ids; file bytes transfer via `transferFiles` (when
 *   provided): every anonymous-cache blob still queued for its first
 *   upload moves into the scoped store's queue, so a connected store
 *   pushes them to the server after retirement.
 */

import { mergeDatabaseRecords } from "betterbase/db";
import type { CollectionDefHandle } from "betterbase/db";
import type { Database } from "betterbase/db";
import type { MergeDatabaseRecordsOptions, MergeDatabaseRecordsResult } from "betterbase/db";
import { accountScopeHash } from "./account-db.js";

/** Marker value once the anonymous database files have been deleted. */
const MARKER_RETIRED = "retired";

/**
 * localStorage key for this app+scope's adoption state machine. Exported
 * for tests that need to pre-seed a state (e.g. disarm retirement) —
 * the format is private to this module otherwise.
 */
export async function adoptionMarkerKey(appName: string, scopeKey: string): Promise<string> {
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
  /**
   * Declared-default filter (`mergeDatabaseRecords`'s `skipRecord`):
   * pristine default/sample records are phantom data and never adopt.
   * Apps pass their `defineDefaultData(...).isPristine`.
   */
  skipRecord?: MergeDatabaseRecordsOptions["skipRecord"];
}

/**
 * Merge all records of `collections` from the anonymous database into the
 * account database. Returns the merge breakdown (`.merged` is 0 when
 * there is nothing to adopt or this scope already adopted).
 *
 * A pristine-only anonymous workspace (a first visit that only seeded
 * defaults) adopts nothing and marks nothing — the correct end state is
 * "no user data", and the unmarked marker keeps the next login's
 * adoption armed for data created after this one (the anonymous db is
 * also the logged-out workspace, so it is deliberately NOT deleted).
 *
 * Throws on bulk errors — callers run this before marking the scope
 * ready, so a failed adoption surfaces as a scope-open error rather
 * than a silently empty app.
 */
/** Nothing-to-do result shared by the early returns. */
const NOTHING_ADOPTED: MergeDatabaseRecordsResult = {
  merged: 0,
  skipped: 0,
  skippedTombstoned: 0,
  skippedConflict: 0,
};

export async function adoptLocalData(
  options: AdoptLocalDataOptions,
): Promise<MergeDatabaseRecordsResult> {
  const { appName, scopeKey, anonymous, target, collections, skipRecord } = options;
  if (!anonymous) return NOTHING_ADOPTED;

  const marker = await adoptionMarkerKey(appName, scopeKey);
  const state = localStorage.getItem(marker);
  // "adopted" (pending retirement) blocks a re-run; a retired marker
  // re-arms adoption — the anonymous database was deleted, so anything in
  // a re-born one was created after retirement and must merge on the
  // next login (offline-first holds for every logout/login cycle).
  if (state !== null && state !== MARKER_RETIRED) return NOTHING_ADOPTED;

  const result = await mergeDatabaseRecords({
    source: anonymous,
    target,
    collections,
    skipRecord,
  });

  if (result.merged > 0) {
    localStorage.setItem(marker, "adopted");
  }
  return result;
}

export interface RetireLocalDataOptions {
  /** App namespace used for the adoption marker (same as adoptLocalData). */
  appName: string;
  /** Account scope key that performed the adoption. */
  scopeKey: string;
  /**
   * Moves still-unuploaded file blobs out of the anonymous cache before it
   * is deleted (e.g. `FileStore.transferUnuploadedFrom`). Must run after the
   * adoption marker confirms a pending retirement and before deletion — a
   * failure aborts retirement so the bytes survive for the next attempt.
   */
  transferFiles?: () => Promise<void>;
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
  const { appName, scopeKey, deleteAnonymousDb, transferFiles } = options;
  const marker = await adoptionMarkerKey(appName, scopeKey);
  const state = localStorage.getItem(marker);
  if (state === null || state === MARKER_RETIRED) return false;

  // Preserve un-uploaded blobs before the cache is deleted. A failure here
  // throws and leaves the marker pending — retirement (and deletion)
  // retries on the next ready transition instead of losing the bytes.
  if (transferFiles) await transferFiles();

  await deleteAnonymousDb();
  localStorage.setItem(marker, MARKER_RETIRED);
  return true;
}
