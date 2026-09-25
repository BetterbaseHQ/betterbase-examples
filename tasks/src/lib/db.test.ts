import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db, openDatabaseForScope } from "./db";
import { lists } from "./collections.js";

// AUD-045: one fixed database per app meant a prior account's decrypted
// records stayed visible to the next account (and to the unauthenticated
// view). The database name is now the isolation boundary: bare name for
// anonymous/local data (retained, never deleted), `name_<hash>` per
// account. Exercises the real module binding swap.
//
// On first login the anonymous workspace is ADOPTED: its records merge
// into the account database (idempotent, one-time per scope) so local
// data survives connecting — offline-first. Only the first account
// opened from the anonymous namespace adopts; later accounts stay
// isolated from each other.

interface Wipeable {
  query(c: never, o: unknown): Promise<{ records: Array<{ id: string }> }>;
  delete(c: never, id: string): Promise<unknown>;
}

/** Reads the live `db` binding — a snapshot would wipe the wrong database
 * after a scope swap. */
async function wipeCurrent() {
  const current = db as unknown as Wipeable;
  const all = await current.query(lists as never, {});
  await Promise.all(all.records.map((r) => current.delete(lists as never, r.id)));
}

beforeEach(() => {
  // Adoption is one-time per (app, scope) via a localStorage marker —
  // clear markers so every run exercises the adoption path deterministically.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)!;
    if (key.startsWith("bb_local_adopted_")) localStorage.removeItem(key);
  }
});

afterEach(async () => {
  // Leave the module in the anonymous state, cleaned, for other test files
  await openDatabaseForScope(null);
  await wipeCurrent();
});

describe("account-scoped databases (AUD-045)", () => {
  it("adopts the anonymous workspace into the first account, isolates later accounts, retains anonymous", async () => {
    // Anonymous (module default)
    await db.put(lists, { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", name: "Local groceries", color: "", todos: [] } as never);

    // Account A: the anonymous records were adopted — local data
    // survives connecting (offline-first contract)
    await openDatabaseForScope("account-A");
    expect((await db.query(lists, {})).records.map((r) => r.id)).toEqual(["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"]);
    await db.put(lists, { id: "a-1", name: "A's list", color: "", todos: [] } as never);

    // Account B: opened from A's scope, not the anonymous namespace —
    // empty. Adoption never crosses account boundaries.
    await openDatabaseForScope("account-B");
    expect((await db.query(lists, {})).records).toHaveLength(0);
    await db.put(lists, { id: "b-1", name: "B's list", color: "", todos: [] } as never);

    // Switching back to A restores A's records exactly (adopted + own)
    await openDatabaseForScope("account-A");
    expect((await db.query(lists, {})).records.map((r) => r.id).sort()).toEqual(["a-1", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"]);

    // The anonymous namespace survives every switch (never modified)
    await openDatabaseForScope(null);
    expect((await db.query(lists, {})).records.map((r) => r.id)).toEqual(["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"]);
  });


  it("reopening the same scope is a no-op (no spurious swap)", async () => {
    await openDatabaseForScope("account-A");
    // Test files share module state — clean this scope's leftovers first
    await wipeCurrent();
    await db.put(lists, { id: "stable-1", name: "Stays", color: "", todos: [] } as never);
    const before = db;
    await openDatabaseForScope("account-A");
    expect(db).toBe(before);
    expect((await db.query(lists, {})).records.map((r) => r.id)).toEqual(["stable-1"]);
  });
});
