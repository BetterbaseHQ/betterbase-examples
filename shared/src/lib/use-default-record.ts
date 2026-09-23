import { useEffect, useRef } from "react";
import { useSyncDb } from "betterbase/sync/react";
import type { CollectionDefHandle, SchemaShape } from "betterbase/db";
import { reportError } from "../notify.js";

/**
 * Deterministic record id for a collection's default record.
 *
 * Defaults MUST use a stable id rather than a generated one: two devices
 * seeding a fresh account (or an adopted anonymous workspace meeting the
 * server's copy) would otherwise create two distinct "My Tasks" records
 * that CRDTs can never collapse. With one stable id, the concurrent seeds
 * merge into a single record instead of duplicating.
 */
export function defaultRecordId(collection: { name: string }): string {
  return `default_${collection.name}`;
}

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
): void {
  const db = useSyncDb();
  const attempted = useRef(false);

  useEffect(() => {
    if (!ready || attempted.current) return;
    attempted.current = true;
    const id = defaultRecordId(collection);
    db.getAll(collection)
      .then(async (existing) => {
        if (existing.length > 0) return;
        // Respect a deliberate deletion: a tombstone under the
        // deterministic id means the user removed this default on some
        // device — recreating it would resurrect it (and put onto a
        // tombstone is rejected anyway).
        const deleted = await db.get(collection, id, { includeDeleted: true });
        if (deleted !== null) return;
        return create(id);
      })
      .catch((err) => {
        reportError(err, errorMessage);
        attempted.current = false;
      });
  }, [ready, db, collection, create, errorMessage]);
}
