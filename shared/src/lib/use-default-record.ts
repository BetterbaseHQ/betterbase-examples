import { useEffect, useRef } from "react";
import { useSyncDb } from "betterbase/sync/react";
import type { CollectionDefHandle, SchemaShape } from "betterbase/db";
import { reportError } from "../notify.js";

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
 * One-shot per mount: a failed create releases the guard so a later
 * mount/effect can retry (AUD-053).
 */
export function useDefaultRecord(
  ready: boolean,
  collection: CollectionDefHandle<string, SchemaShape>,
  create: () => Promise<unknown>,
  errorMessage: string,
): void {
  const db = useSyncDb();
  const attempted = useRef(false);

  useEffect(() => {
    if (!ready || attempted.current) return;
    attempted.current = true;
    db.getAll(collection)
      .then((existing) => (existing.length === 0 ? create() : undefined))
      .catch((err) => {
        reportError(err, errorMessage);
        attempted.current = false;
      });
  }, [ready, db, collection, create, errorMessage]);
}
