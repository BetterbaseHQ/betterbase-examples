/**
 * Declared default (sample) data — the single source of truth for what
 * an app seeds into an empty workspace, and for recognizing those seeds
 * later as phantom data during account adoption.
 *
 * The pattern: an app declares its defaults ONCE, as static records with
 * stable ids. The same declaration then powers:
 *
 * - seeding — `seed()` writes declared records whose ids are not yet
 *   present (tombstones respected: a default the user deleted stays
 *   deleted), for both the logged-out workspace and the post-sync
 *   emptiness check (`useDefaultRecord`).
 * - adoption — `isPristine()` answers whether a record is still
 *   byte-for-byte a declared default. Adoption skips pristine records
 *   entirely (see `skipRecord` on the SDK's `mergeDatabaseRecords`):
 *   the user never authored them, so they must not land in the account
 *   and sync to every device. An EDITED default (renamed list, checked
 *   todo) no longer matches the declaration and merges as real data.
 * - structural completeness — `seedChildren()` restores declared child
 *   records when their declared parent is alive (an edited default
 *   board adopts while its pristine columns skip; the account's
 *   emptiness-gated seeders never fire, and adopted cards would dangle
 *   referencing columns that were never seeded).
 *
 * Because the declaration is code (not state recorded at seed time),
 * there is nothing to drift: cleared storage re-seeds, and the seed
 * still matches. Records must be statically expressible — no
 * `Date.now()`/random values inside default payloads (stable ids remain
 * required so concurrent seeds on two devices collapse via CRDT merge).
 */

import type { CollectionDefHandle, Database } from "betterbase/db";

/** Static default records per collection name. Every record needs a stable `id`. */
export type DefaultDataDeclaration = Record<string, Record<string, unknown>[]>;

/** Fields ignored when comparing a stored record against its declaration. */
const IGNORED_FIELDS = new Set(["id", "createdAt", "updatedAt", "_spaceId", "deleted"]);

/**
 * Deterministic JSON with object keys sorted (order-independent
 * compare). Dates compare by ISO string (a `t.date()` field must match
 * its declared ISO value); anything not statically declarable (Map,
 * Set, functions, symbols) throws — declarations are code and should
 * fail at definition time, not silently never match.
 */
function stableStringify(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([k]) => !IGNORED_FIELDS.has(k))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export interface DefaultData {
  /** Collection names that carry declared defaults. */
  readonly collectionNames: readonly string[];

  /**
   * True when `record` is exactly a declared default for `def`'s
   * collection (timestamps and space stamps ignored). Signature is
   * compatible with `mergeDatabaseRecords`'s `skipRecord` option.
   * Records whose id has no declaration are user data: false.
   */
  isPristine(def: CollectionDefHandle, record: Record<string, unknown>): boolean;

  /**
   * Write declared records for `collections` whose ids are not present
   * in `db` (checking tombstones too — a deleted default must not be
   * resurrected). Idempotent; returns how many records were written.
   * Existing records are never overwritten.
   */
  seed(db: Database, collections: ReadonlyArray<CollectionDefHandle>): Promise<number>;

  /**
   * Write the declared record for `(def, id)` only — the
   * `useDefaultRecord` create-callback shape. Respects tombstones.
   */
  seedRecord(db: Database, def: CollectionDefHandle, id: string): Promise<void>;

  /**
   * Seed declared CHILD records whose `parentField` points at a declared
   * parent id (a declared id in another collection of this declaration)
   * that is currently ALIVE in `db`. Idempotent and
   * tombstone-respecting on both sides: a deleted parent stays deleted,
   * a deleted child is not resurrected. Returns how many records were
   * written.
   */
  seedChildren(
    db: Database,
    collections: ReadonlyArray<CollectionDefHandle>,
    parentField: string,
  ): Promise<number>;
}

export function defineDefaultData(declaration: DefaultDataDeclaration): DefaultData {
  const byCollection = new Map<string, Record<string, unknown>[]>();
  for (const [name, records] of Object.entries(declaration)) {
    const seen = new Set<string>();
    for (const record of records) {
      if (typeof record.id !== "string" || record.id.length === 0) {
        throw new Error(
          `defineDefaultData: every default record needs a stable string id (collection ${name})`,
        );
      }
      if (seen.has(record.id)) {
        throw new Error(
          `defineDefaultData: duplicate default id ${record.id} in collection ${name}`,
        );
      }
      seen.add(record.id);
    }
    byCollection.set(name, records);
  }

  const declared = (def: CollectionDefHandle): Record<string, unknown>[] =>
    byCollection.get(def.name) ?? [];

  const defByName = (
    collections: ReadonlyArray<CollectionDefHandle>,
    name: string,
  ): CollectionDefHandle | undefined => collections.find((c) => c.name === name);

  return {
    collectionNames: [...byCollection.keys()],

    isPristine(def, record) {
      const id = record.id;
      if (typeof id !== "string") return false;
      const declaredRecord = declared(def).find((r) => r.id === id);
      if (!declaredRecord) return false;
      return stableStringify(record) === stableStringify(declaredRecord);
    },

    async seed(db, collections) {
      let written = 0;
      for (const def of collections) {
        const defaults = declared(def);
        if (defaults.length === 0) continue;
        // Absent from the full (tombstone-inclusive) read = never created
        // here — unlike an alive read, this also catches deleted defaults
        // so we do not resurrect them.
        const knownIds = new Set(
          (await db.getAll(def, { includeDeleted: true })).map(
            (r) => (r as Record<string, unknown>).id as string,
          ),
        );
        for (const record of defaults) {
          if (knownIds.has(record.id as string)) continue;
          const { id, ...payload } = record;
          await db.put(def, structuredClone(payload), { id: id as string });
          written++;
        }
      }
      return written;
    },

    async seedRecord(db, def, id) {
      const declaredRecord = declared(def).find((r) => r.id === id);
      if (!declaredRecord) {
        throw new Error(`defineDefaultData: no declared default ${def.name}/${id}`);
      }
      // Nullish: adapter get() returns undefined, OpfsDb null.
      const existing = await db.get(def, id, { includeDeleted: true });
      if (existing != null) return;
      const { id: _drop, ...payload } = declaredRecord;
      await db.put(def, structuredClone(payload), { id });
    },

    async seedChildren(db, collections, parentField) {
      // Declared ids per collection — any of them can act as a parent.
      const parentIdsByCollection = new Map<string, Set<string>>();
      for (const [name, records] of byCollection) {
        parentIdsByCollection.set(name, new Set(records.map((r) => r.id as string)));
      }
      let written = 0;
      for (const def of collections) {
        const defaults = declared(def);
        const ownIds = parentIdsByCollection.get(def.name);
        for (const record of defaults) {
          const parentId = record[parentField];
          if (typeof parentId !== "string") continue;
          if (ownIds?.has(parentId)) continue; // self-reference, not a child
          const parentName = [...parentIdsByCollection.entries()].find(
            ([name, ids]) => name !== def.name && ids.has(parentId),
          )?.[0];
          if (!parentName) continue; // parent is not declared — app data
          const parentDef = defByName(collections, parentName);
          if (!parentDef) continue;
          // Parent must be alive (default alive-only read): a deleted
          // default parent stays deleted, children with it.
          if ((await db.get(parentDef, parentId)) == null) continue;
          // Child must be absent, tombstones included.
          if ((await db.get(def, record.id as string, { includeDeleted: true })) != null) {
            continue;
          }
          const { id, ...payload } = record;
          await db.put(def, structuredClone(payload), { id: id as string });
          written++;
        }
      }
      return written;
    },
  };
}
