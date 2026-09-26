/**
 * adoptLocalData / retireLocalData — the adoption state machine.
 *
 * This machinery permanently deletes the anonymous database based on a
 * localStorage marker and a phase signal; these tests pin the marker
 * transitions directly (the full app flow is covered by live
 * verification and the tasks db tests).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const deleteNamespace = vi.fn<(ns: string) => Promise<void>>(async () => undefined);
vi.mock("betterbase/sync", () => ({
  deleteFilesNamespace: (ns: string) => deleteNamespace(ns),
}));

import { adoptLocalData, retireLocalData } from "./adopt-local-data.js";
import { accountScopeHash } from "./account-db.js";
import type { CollectionDefHandle, Database } from "betterbase/db";

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
    const anon = fakeDb([{ id: "11111111-2222-4333-8444-555555555555", name: "Groceries" }]);
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
    const anon = fakeDb([{ id: "11111111-2222-4333-8444-555555555555", name: "Groceries" }]);
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
    const anon = fakeDb([{ id: "11111111-2222-4333-8444-555555555555", name: "Second cycle" }]);
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

  it("transfers un-uploaded blobs before deleting the anonymous cache", async () => {
    const key = await markerKey();
    localStorage.setItem(key, "adopted");
    const order: string[] = [];
    const transfer = vi.fn(async () => {
      order.push("transfer");
    });
    const del = vi.fn(async () => {
      order.push("delete");
    });
    const ran = await retireLocalData({
      appName: "tasks",
      scopeKey: "scope-1",
      deleteAnonymousDb: del,
      transferFiles: transfer,
    });
    expect(ran).toBe(true);
    expect(order).toEqual(["transfer", "delete"]);
  });

  it("deletes the anonymous files namespace after the records database", async () => {
    const key = await markerKey();
    localStorage.setItem(key, "adopted");
    const order: string[] = [];
    const del = vi.fn(async () => {
      order.push("records-deleted");
    });
    deleteNamespace.mockImplementation(async (ns: string) => {
      order.push(`files-deleted:${ns}`);
    });
    try {
      const ran = await retireLocalData({
        appName: "tasks",
        scopeKey: "scope-1",
        deleteAnonymousDb: del,
        deleteAnonymousFilesNamespace: "files-tasks-anon",
      });
      expect(ran).toBe(true);
      expect(order).toEqual(["records-deleted", "files-deleted:files-tasks-anon"]);
    } finally {
      deleteNamespace.mockImplementation(async () => undefined);
    }
  });

  it("a failed namespace deletion leaves retirement pending for retry", async () => {
    const key = await markerKey();
    localStorage.setItem(key, "adopted");
    const del = vi.fn(async () => undefined);
    deleteNamespace.mockImplementation(async () => {
      throw new Error("open in this profile");
    });
    try {
      await expect(
        retireLocalData({
          appName: "tasks",
          scopeKey: "scope-1",
          deleteAnonymousDb: del,
          deleteAnonymousFilesNamespace: "files-tasks-anon",
        }),
      ).rejects.toThrow("open in this profile");
      // Records are gone but the marker stays pending — the next login's
      // ready transition retries the namespace deletion (idempotent).
      expect(localStorage.getItem(key)).toBe("adopted");
    } finally {
      deleteNamespace.mockImplementation(async () => undefined);
    }
  });

  it("a failed transfer aborts retirement — bytes survive for the retry", async () => {
    const key = await markerKey();
    localStorage.setItem(key, "adopted");
    const transfer = vi.fn(async () => {
      throw new Error("quota exceeded");
    });
    const del = vi.fn(async () => undefined);
    await expect(
      retireLocalData({
        appName: "tasks",
        scopeKey: "scope-1",
        deleteAnonymousDb: del,
        transferFiles: transfer,
      }),
    ).rejects.toThrow("quota exceeded");
    expect(del).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe("adopted");
  });
});

describe("adoptLocalData — records adopt as-is", () => {
  it("merges every anonymous record; ids are untouched", async () => {
    localStorage.clear();
    const anon = fakeDb([
      { id: "11111111-2222-4333-8444-555555555555", name: "List A" },
      { id: "22222222-3333-4444-8555-666666666666", name: "List B" },
    ]);
    const target = fakeDb();
    const result = await adoptLocalData({
      appName: "tasks",
      scopeKey: "scope-guard",
      anonymous: anon as unknown as Database,
      target: target as unknown as Database,
      collections: [def],
    });
    expect(result.merged).toBe(2);
    const putArg = target.bulkPut.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
    expect(putArg.map((r) => r.id)).toEqual([
      "11111111-2222-4333-8444-555555555555",
      "22222222-3333-4444-8555-666666666666",
    ]);
  });
});
