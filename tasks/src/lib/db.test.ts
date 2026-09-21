import { describe, it, expect, afterEach } from "vitest";
import { db, openDatabaseForScope } from "./db";
import { lists } from "./collections.js";

// AUD-045: one fixed database per app meant a prior account's decrypted
// records stayed visible to the next account (and to the unauthenticated
// view). The database name is now the isolation boundary: bare name for
// anonymous/local data (retained, never deleted), `name_<hash>` per
// account. Exercises the real module binding swap.

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

afterEach(async () => {
  // Leave the module in the anonymous state, cleaned, for other test files
  await openDatabaseForScope(null);
  await wipeCurrent();
});

describe("account-scoped databases (AUD-045)", () => {
  it("isolates records per account and retains the anonymous namespace", async () => {
    // Anonymous (module default)
    await db.put(lists, { id: "anon-1", name: "Local groceries", color: "", todos: [] } as never);

    // Account A: separate database, empty
    await openDatabaseForScope("account-A");
    expect((await db.query(lists, {})).records).toHaveLength(0);
    await db.put(lists, { id: "a-1", name: "A's list", color: "", todos: [] } as never);

    // Account B: another separate database, empty — B never sees A's records
    await openDatabaseForScope("account-B");
    expect((await db.query(lists, {})).records).toHaveLength(0);
    await db.put(lists, { id: "b-1", name: "B's list", color: "", todos: [] } as never);

    // Switching back to A restores A's records exactly
    await openDatabaseForScope("account-A");
    expect((await db.query(lists, {})).records.map((r) => r.id)).toEqual(["a-1"]);

    // The anonymous namespace survives every switch
    await openDatabaseForScope(null);
    expect((await db.query(lists, {})).records.map((r) => r.id)).toEqual(["anon-1"]);
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
