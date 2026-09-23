/**
 * One-time adoption of anonymous (logged-out) records into an account's
 * database.
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
 * Semantics:
 * - The record merge itself is `mergeDatabaseRecords` from the SDK
 *   (idempotent: records keep their ids, so a repeated merge is a no-op
 *   CRDT-wise rather than a duplicate).
 * - A per-(app, scope) marker in localStorage skips repeat runs; without
 *   it every login would re-put every anonymous record as spurious
 *   updates.
 * - The anonymous namespace is never modified or cleared — logging out
 *   still shows it (AUD-045 retention policy).
 * - Adoption copies records only. Cached file blobs (FileStore) are not
 *   migrated; apps with file fields should treat adopted-but-unsynced
 *   file references as missing until re-uploaded.
 */

import { mergeDatabaseRecords } from "betterbase/db";
import type { CollectionDefHandle } from "betterbase/db";
import type { Database } from "betterbase/db";
import { accountScopeHash } from "./account-db.js";

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

  const marker = `bb_local_adopted_${appName}_${await accountScopeHash(scopeKey)}`;
  if (localStorage.getItem(marker) !== null) return 0;

  const adopted = await mergeDatabaseRecords({
    source: anonymous,
    target,
    collections,
  });

  if (adopted > 0) {
    localStorage.setItem(marker, String(Date.now()));
  }
  return adopted;
}
