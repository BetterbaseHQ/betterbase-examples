import { useEffect, useRef } from "react";
import { useSyncDb } from "betterbase/sync/react";
import type { CollectionDefHandle, SchemaShape } from "betterbase/db";
import { reportError } from "../notify.js";
import { DEFAULTS_NAMESPACE, uuidV5 } from "./uuid-v5.js";

/**
 * Deterministic record id for a collection's default record.
 *
 * Defaults MUST use a stable id rather than a generated one: two devices
 * seeding a fresh account (or an adopted anonymous workspace meeting the
 * server's copy) would otherwise create two distinct "My Tasks" records
 * that CRDTs can never collapse. With one stable id, the concurrent seeds
 * merge into a single record instead of duplicating.
 *
 * The id is a namespaced UUID v5: the sync server rejects non-UUID record
 * ids outright (`InvalidRecordId`), which the original `default_<name>`
 * scheme hit — the record then never synced and every push attempt was
 * rejected and quarantined. v5 keeps determinism while staying valid.
 */
export function defaultRecordId(collection: { name: string }): string {
  return uuidV5(collection.name, DEFAULTS_NAMESPACE);
}

/**
 * The pre-v5 scheme (`default_<name>`). Kept only for the one-time
 * migration off records the server refuses to store.
 */
export function legacyDefaultRecordId(collection: { name: string }): string {
  return `default_${collection.name}`;
}

const HYPHENATED_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Auto-create a default record once bootstrap sync completes — only when the
 * collection is verifiably empty.
 *
 * Checking a reactive query's length when `phase === "ready"` is not
 * sufficient: the query starts empty and repopulates a tick after the pull
 * applies (especially on reloads), so the check races empty and duplicates
 * the default record on every reload. Instead this hook re-reads the
 * collection directly from the sync database at ready-time — that read is
 * ordered after the pull's apply writes — so emptiness is decided against
 * the post-pull state.
 *
 * The factory receives the deterministic default id (see `defaultRecordId`)
 * and must put the record with exactly that id, so seeds from different
 * devices collapse via CRDT merge instead of duplicating.
 *
 * One-shot per mount: a failed create releases the guard so a later
 * mount/effect can retry (AUD-053).
 */
export function useDefaultRecord(
  ready: boolean,
  collection: CollectionDefHandle<string, SchemaShape>,
  create: (id: string) => Promise<unknown>,
  errorMessage: string,
  /** Extra collections to sweep for unsyncable non-UUID ids (e.g. board columns). */
  alsoSweep?: ReadonlyArray<CollectionDefHandle<string, SchemaShape>>,
): void {
  const db = useSyncDb();
  const attempted = useRef(false);
  // Callers pass inline closures (fresh identity every render). Keeping them
  // out of the effect deps is what makes the one-shot guard real: with them
  // inlined, a failed seed re-fires the whole chain on every render. The
  // refs route the latest callback to whichever effect instance runs.
  const createRef = useRef(create);
  createRef.current = create;
  const alsoSweepRef = useRef(alsoSweep);
  alsoSweepRef.current = alsoSweep;

  useEffect(() => {
    if (!ready || attempted.current) return;
    attempted.current = true;
    const id = defaultRecordId(collection);
    db.getAll(collection)
      .then(async (existing) => {
        // Respect a deliberate deletion BEFORE the sweep: a tombstone
        // under the deterministic id (or a pre-migration tombstone under
        // the legacy id) means the user removed this default on some
        // device — recreating it would resurrect it (and put onto a
        // tombstone is rejected anyway). The sweep below tombstones live
        // legacy-id records, so sampling its state first is what
        // distinguishes "user deleted" from "migration garbage".
        // Tombstone = present with includeDeleted, absent from the alive
        // read (the db layer's convention — records carry no flag).
        const aliveIds = new Set(existing.map((r) => r.id));
        const tombstonedIds = new Set(
          (await db.getAll(collection, { includeDeleted: true }))
            .filter((r) => !aliveIds.has(r.id))
            .map((r) => r.id),
        );
        if (tombstonedIds.has(id)) return;
        if (tombstonedIds.has(legacyDefaultRecordId(collection))) return;

        // One-time migration off the pre-v5 id scheme: the sync server
        // rejects non-UUID record ids (`InvalidRecordId`), so such records
        // can never sync and their pushes get quarantined. Tombstone them
        // and let the seed below recreate the default under a valid id.
        for (const c of [collection, ...(alsoSweepRef.current ?? [])]) {
          const rows = c === collection ? existing : await db.getAll(c);
          for (const row of rows) {
            if (!HYPHENATED_UUID_RE.test(row.id)) {
              await db.delete(c, row.id).catch(() => undefined);
            }
          }
        }
        // Re-read: the sweep may have emptied the collection
        if ((await db.getAll(collection)).length > 0) return;
        return createRef.current(id);
      })
      .catch((err) => {
        reportError(err, errorMessage);
        attempted.current = false;
      });
  }, [ready, db, collection, errorMessage]);
}
