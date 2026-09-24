/**
 * adoptLocalData / retireLocalData — the adoption state machine.
 *
 * This machinery permanently deletes the anonymous database based on a
 * localStorage marker and a phase signal; these tests pin the marker
 * transitions directly (the full app flow is covered by live
 * verification and the tasks db tests).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { adoptLocalData, retireLocalData } from "./adopt-local-data.js";
import { accountScopeHash } from "./account-db.js";
import type { CollectionDefHandle } from "betterbase/db";

/** Minimal Database double: records in a Map. */
function fakeDb(records: Array<Record<string, unknown>> = []) {
  const byId = new Map(records.map((r) => [r["id"] as string, { ...r }]));
  const db = {
    getAll: vi.fn(async () => [...byId.values()].map((r) => ({ ...r }))),
    bulkPut: vi.fn(async (_def: unknown, writes: Array<Record<string, unknown>>) => {
      for (const w of writes) byId.set(w["id"] as string, { ...w });
      return { records: writes, errors: [] };
    }),
  };
  return db;
}

const def = { name: "lists" } as unknown as CollectionDefHandle;

async function markerKey(): Promise<string> {
  return `bb_local_adopted_tasks_${await accountScopeHash("scope-1")}`;
}

beforeEach(() => {
  localStorage.clear();
});

describe("adoptLocalData", () => {
  it("merges anonymous records and writes the adopted marker", async () => {
    const anon = fakeDb([{ id: "a1", name: "Groceries" }]);
    const target = fakeDb();
    const adopted = await adoptLocalData({
      appName: "tasks",
      scopeKey: "scope-1",
      anonymous: anon as never,
      target: target as never,
      collections: [def],
    });
    expect(adopted.merged).toBe(1);
    expect(target.bulkPut).toHaveBeenCalled();
    expect(localStorage.getItem(await markerKey())).not.toBeNull();
  });

  it("writes NO marker for an empty anonymous db — later data must still adopt", async () => {
    const anon = fakeDb();
    const target = fakeDb();
    const adopted = await adoptLocalData({
      appName: "tasks",
      scopeKey: "scope-1",
      anonymous: anon as never,
      target: target as never,
      collections: [def],
    });
    expect(adopted.merged).toBe(0);
    // The critical property: no marker means a later login (after the
    // user creates local data) still runs the merge.
    expect(Object.keys(localStorage).filter((k) => k.startsWith("bb_local_adopted"))).toEqual([]);
  });

  it("a pending (adopted) marker blocks a re-run", async () => {
    const anon = fakeDb([{ id: "a1", name: "Groceries" }]);
    const target = fakeDb();
    await adoptLocalData({
      appName: "tasks",
      scopeKey: "scope-1",
      anonymous: anon as never,
      target: target as never,
      collections: [def],
    });
    anon.getAll.mockClear();
    const again = await adoptLocalData({
      appName: "tasks",
      scopeKey: "scope-1",
      anonymous: anon as never,
      target: target as never,
      collections: [def],
    });
    expect(again.merged).toBe(0);
    expect(anon.getAll).not.toHaveBeenCalled();
  });

  it("a retired marker re-arms adoption for the next cycle", async () => {
    const anon = fakeDb([{ id: "a1", name: "Second cycle" }]);
    const target = fakeDb();
    const key = await markerKey();
    localStorage.setItem(key, "retired");

    const adopted = await adoptLocalData({
      appName: "tasks",
      scopeKey: "scope-1",
      anonymous: anon as never,
      target: target as never,
      collections: [def],
    });
    expect(adopted.merged).toBe(1);
    expect(localStorage.getItem(key)).toBe("adopted");
  });

  it("a pristine-only anonymous workspace adopts nothing and writes no marker", async () => {
    const anon = fakeDb([{ id: "default_lists", name: "My Tasks", color: "indigo", todos: [] }]);
    const target = fakeDb();
    const adopted = await adoptLocalData({
      appName: "tasks",
      scopeKey: "scope-1",
      anonymous: anon as never,
      target: target as never,
      collections: [def],
      skipRecord: (_def, record) => record.id === "default_lists",
    });
    expect(adopted).toEqual({
      merged: 0,
      skippedPristine: 1,
      skippedTombstoned: 0,
    });
    expect(target.bulkPut).not.toHaveBeenCalled();
    // No marker: the anonymous db is the logged-out workspace and the
    // next login must still adopt anything real created later.
    expect(Object.keys(localStorage).filter((k) => k.startsWith("bb_local_adopted"))).toEqual([]);
  });
});

describe("retireLocalData", () => {
  it("deletes the anonymous db and marks retired", async () => {
    const key = await markerKey();
    localStorage.setItem(key, "adopted");
    const del = vi.fn(async () => undefined);
    const ran = await retireLocalData({
      appName: "tasks",
      scopeKey: "scope-1",
      deleteAnonymousDb: del,
    });
    expect(ran).toBe(true);
    expect(del).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(key)).toBe("retired");
  });

  it("no-ops without a marker or when already retired", async () => {
    const del = vi.fn(async () => undefined);
    const opts = { appName: "tasks", scopeKey: "scope-1", deleteAnonymousDb: del };
    expect(await retireLocalData(opts)).toBe(false);
    const key = await markerKey();
    localStorage.setItem(key, "retired");
    expect(await retireLocalData(opts)).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });

  it("a failed deletion keeps the marker pending (retry later)", async () => {
    const key = await markerKey();
    localStorage.setItem(key, "adopted");
    const del = vi.fn(async () => {
      throw new Error("lock timeout");
    });
    await expect(
      retireLocalData({ appName: "tasks", scopeKey: "scope-1", deleteAnonymousDb: del }),
    ).rejects.toThrow("lock timeout");
    expect(localStorage.getItem(key)).toBe("adopted");
  });
});
