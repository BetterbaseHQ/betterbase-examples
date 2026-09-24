/**
 * Declared default data — the isPristine/seed/seedChildren contract
 * behind seed-aware adoption.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineDefaultData } from "./default-data.js";
import type { CollectionDefHandle, Database } from "betterbase/db";

const lists = { name: "lists" } as CollectionDefHandle;
const columns = { name: "columns" } as CollectionDefHandle;

const defaults = defineDefaultData({
  lists: [
    {
      id: "default_lists",
      name: "My Tasks",
      color: "indigo",
      todos: [],
    },
  ],
  columns: [
    { id: "default_lists-col-1", boardId: "default_lists", name: "To Do", sortOrder: 1 },
    { id: "default_lists-col-2", boardId: "default_lists", name: "Done", sortOrder: 2 },
  ],
});

/** Rows carry `__collection` so per-collection reads stay honest. */
type Row = Record<string, unknown> & { __collection?: string };

function mockDb(existing: { alive?: Row[]; tombstoned?: Row[] } = {}) {
  const puts: { collection: string; record: Record<string, unknown>; id: string }[] = [];
  const pool = (name: string, opts?: { includeDeleted?: boolean }) => {
    const alive = (existing.alive ?? []).filter(
      (r) => r.__collection === name || r.__collection === undefined,
    );
    const dead = (existing.tombstoned ?? []).filter(
      (r) => r.__collection === name || r.__collection === undefined,
    );
    return opts?.includeDeleted ? [...alive, ...dead] : [...alive];
  };
  const db = {
    getAll: vi.fn(
      async (def: { name: string }, opts?: { includeDeleted?: boolean }) =>
        pool(def.name, opts) as never,
    ),
    get: vi.fn(
      async (def: { name: string }, id: string, opts?: { includeDeleted?: boolean }) =>
        (pool(def.name, opts).find((r) => r.id === id) as never) ?? null,
    ),
    put: vi.fn(
      async (def: { name: string }, record: Record<string, unknown>, opts: { id: string }) => {
        puts.push({ collection: def.name, record, id: opts.id });
        return { ...record, id: opts.id };
      },
    ),
  } as unknown as Database;
  return { db, puts };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("isPristine", () => {
  it("matches a stored record that is exactly the declaration (engine fields ignored)", () => {
    expect(
      defaults.isPristine(lists, {
        id: "default_lists",
        name: "My Tasks",
        color: "indigo",
        todos: [],
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z",
        _spaceId: "sp_123",
      }),
    ).toBe(true);
  });

  it("rejects an edited default — that is real data and must adopt", () => {
    expect(
      defaults.isPristine(lists, {
        id: "default_lists",
        name: "Groceries",
        color: "indigo",
        todos: [],
      }),
    ).toBe(false);
    expect(
      defaults.isPristine(lists, {
        id: "default_lists",
        name: "My Tasks",
        color: "indigo",
        todos: [{ id: "t1", text: "buy milk", done: false }],
      }),
    ).toBe(false);
  });

  it("rejects a stored record missing a declared field (non-pristine)", () => {
    expect(
      defaults.isPristine(lists, { id: "default_lists", name: "My Tasks", color: "indigo" }),
    ).toBe(false);
  });

  it("rejects ids with no declaration (user-created records)", () => {
    expect(
      defaults.isPristine(lists, { id: "user_list", name: "Mine", color: "red", todos: [] }),
    ).toBe(false);
  });

  it("ignores key order and extra engine bookkeeping, not extra user fields", () => {
    expect(
      defaults.isPristine(columns, {
        sortOrder: 1,
        name: "To Do",
        boardId: "default_lists",
        id: "default_lists-col-1",
        deleted: null,
      }),
    ).toBe(true);
    expect(
      defaults.isPristine(columns, {
        id: "default_lists-col-1",
        boardId: "default_lists",
        name: "To Do",
        sortOrder: 1,
        archived: true, // a field the app added later = edited
      }),
    ).toBe(false);
  });
});

describe("seed", () => {
  it("writes declared records whose ids are absent, keeping ids stable", async () => {
    const { db, puts } = mockDb();
    const written = await defaults.seed(db, [lists, columns]);
    expect(written).toBe(3);
    expect(puts.map((p) => p.id).sort()).toEqual([
      "default_lists",
      "default_lists-col-1",
      "default_lists-col-2",
    ]);
  });

  it("no-ops for collections with no declaration", async () => {
    const other = { name: "other" } as CollectionDefHandle;
    const { db, puts } = mockDb();
    expect(await defaults.seed(db, [other])).toBe(0);
    expect(puts).toHaveLength(0);
  });

  it("never overwrites and never resurrects: alive and tombstoned ids are left alone", async () => {
    const { db, puts } = mockDb({
      alive: [
        { __collection: "lists", id: "default_lists", name: "Renamed", color: "indigo", todos: [] },
      ],
      tombstoned: [
        {
          __collection: "columns",
          id: "default_lists-col-1",
          boardId: "default_lists",
          name: "To Do",
          sortOrder: 1,
        },
      ],
    });
    const written = await defaults.seed(db, [lists, columns]);
    expect(written).toBe(1);
    expect(puts.map((p) => p.id)).toEqual(["default_lists-col-2"]);
  });

  it("writes a structurally independent copy (later mutation can't leak into the declaration)", async () => {
    const { db, puts } = mockDb();
    await defaults.seed(db, [lists]);
    puts[0]!.record.name = "MUTATED";
    expect(
      defaults.isPristine(lists, {
        id: "default_lists",
        name: "My Tasks",
        color: "indigo",
        todos: [],
      }),
    ).toBe(true);
  });
});

describe("seedRecord", () => {
  it("puts the declared record under the given id when absent", async () => {
    const { db, puts } = mockDb();
    await defaults.seedRecord(db, lists, "default_lists");
    expect(puts).toHaveLength(1);
    expect(puts[0]!.record).toEqual({ name: "My Tasks", color: "indigo", todos: [] });
  });

  it("no-ops for a tombstoned id and throws for an undeclared one", async () => {
    const { db, puts } = mockDb({
      tombstoned: [
        {
          __collection: "lists",
          id: "default_lists",
          name: "My Tasks",
          color: "indigo",
          todos: [],
        },
      ],
    });
    await defaults.seedRecord(db, lists, "default_lists");
    expect(puts).toHaveLength(0);
    await expect(defaults.seedRecord(db, lists, "unknown")).rejects.toThrow(/no declared default/);
  });
});

describe("seedChildren (structural completeness after adoption)", () => {
  it("seeds declared children whose declared parent is alive — e.g. an edited default board that adopted while its pristine columns were skipped", async () => {
    const { db, puts } = mockDb({
      alive: [
        { __collection: "lists", id: "default_lists", name: "Renamed", color: "indigo", todos: [] },
      ],
    });
    const written = await defaults.seedChildren(db, [lists, columns], "boardId");
    expect(written).toBe(2);
    expect(puts.map((p) => p.id).sort()).toEqual(["default_lists-col-1", "default_lists-col-2"]);
  });

  it("does nothing when the declared parent is absent, tombstoned, or user data", async () => {
    const gone = mockDb({
      tombstoned: [
        { __collection: "lists", id: "default_lists", name: "x", color: "y", todos: [] },
      ],
    });
    expect(await defaults.seedChildren(gone.db, [lists, columns], "boardId")).toBe(0);
    expect(gone.puts).toHaveLength(0);

    const other = mockDb({
      alive: [{ __collection: "lists", id: "user_list", name: "Mine", color: "red", todos: [] }],
    });
    expect(await defaults.seedChildren(other.db, [lists, columns], "boardId")).toBe(0);
    expect(other.puts).toHaveLength(0);
  });

  it("respects tombstoned children: only missing ones are written", async () => {
    const { db, puts } = mockDb({
      alive: [
        { __collection: "lists", id: "default_lists", name: "Renamed", color: "indigo", todos: [] },
      ],
      tombstoned: [
        {
          __collection: "columns",
          id: "default_lists-col-1",
          boardId: "default_lists",
          name: "To Do",
          sortOrder: 1,
        },
      ],
    });
    const written = await defaults.seedChildren(db, [lists, columns], "boardId");
    expect(written).toBe(1);
    expect(puts.map((p) => p.id)).toEqual(["default_lists-col-2"]);
  });
});

describe("declaration validation", () => {
  it("rejects records without stable string ids at definition time", () => {
    expect(() => defineDefaultData({ lists: [{ name: "no id" }] })).toThrow(/stable string id/);
  });

  it("rejects duplicate ids within a collection", () => {
    expect(() =>
      defineDefaultData({
        lists: [
          { id: "a", name: "one", color: "x", todos: [] },
          { id: "a", name: "two", color: "y", todos: [] },
        ],
      }),
    ).toThrow(/duplicate default id/);
  });
});
