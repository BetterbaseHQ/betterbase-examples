import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db, boards, columns, cards } from "@/lib/db";
import {
  saveMarker,
  loadMarkers,
  clearMarker,
  completeBoardMove,
  reconcileBoardMoves,
  type BoardMoveMarker,
} from "./board-move";

// The recovery engine runs against the real local db — the same instance
// the app's useBoards uses. Spaces are a middleware concern; recovery only
// depends on record identity and FK fields, which the raw db exercises
// faithfully. Tombstones persist between tests (db.delete), so every test
// uses fresh ids.

const SPACE = "space-test-1";
let seq = 0;
const uid = (prefix: string) => `${prefix}-${++seq}`;

interface TestIds {
  old: string;
  boardNew: string;
  colOld1: string;
  colNew1: string;
}

function makeIds(): TestIds {
  return {
    old: uid("board-old"),
    boardNew: uid("board-new"),
    colOld1: uid("col-old"),
    colNew1: uid("col-new"),
  };
}

function makeMarker(ids: TestIds, overrides: Partial<BoardMoveMarker> = {}): BoardMoveMarker {
  return {
    oldBoardId: ids.old,
    spaceId: SPACE,
    columnIdMap: { [ids.colOld1]: ids.colNew1 },
    childIds: { columns: [], cards: [] },
    boardCreatedAt: "2026-09-21T10:00:00.000Z",
    boardName: null,
    newBoardId: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

const putBoard = (id: string, createdAt?: string) =>
  db.put(boards, { id, name: `board ${id}`, createdAt } as never);
const putColumn = (id: string, boardId: string) =>
  db.put(columns, { id, boardId, name: `col ${id}`, sortOrder: 1 } as never);
const putCard = (id: string, boardId: string, columnId: string) =>
  db.put(cards, {
    id,
    boardId,
    columnId,
    title: `card ${id}`,
    description: "",
    color: "",
    order: 1,
  } as never);

async function boardIdOf(id: string): Promise<string | undefined> {
  return (await db.get(boards, id))?.id;
}
async function cardBoardId(id: string): Promise<string | undefined> {
  return (await db.get(cards, id))?.boardId;
}

// Heterogeneous collection arrays collapse into TS2589 against the typed
// adapter — wipe through a structural view (same approach as the SDK's
// wipeCollections helper).
async function wipeAll() {
  const wipeDb = db as unknown as {
    query(c: never, o: unknown): Promise<{ records: Array<{ id: string }> }>;
    delete(c: never, id: string): Promise<unknown>;
  };
  for (const collection of [cards, columns, boards]) {
    const all = await wipeDb.query(collection as never, {});
    await Promise.all(all.records.map((r) => wipeDb.delete(collection as never, r.id)));
  }
}

beforeEach(async () => {
  localStorage.clear();
  await wipeAll();
});

afterEach(async () => {
  localStorage.clear();
  await wipeAll();
});

describe("board share recovery (AUD-047)", () => {
  it("recovers children stranded by a crash after the board move with FK patches incomplete", async () => {
    // The finding's exact state: everything moved, one card's boardId
    // rewrite failed — it references the tombstoned old board and would be
    // invisible in the new board's view forever without recovery. Raw
    // records carry no _spaceId, so the stray is MOVED (patched-in-place
    // is covered by the fake-db branch test below).
    const ids = makeIds();
    await putBoard(ids.boardNew);
    await putColumn(ids.colNew1, ids.boardNew);
    await putCard(uid("card"), ids.boardNew, ids.colNew1); // patched
    const orphan = await putCard(uid("card"), ids.old, ids.colOld1); // NOT patched

    saveMarker(makeMarker(ids, { newBoardId: ids.boardNew }));

    const result = await reconcileBoardMoves(db as never);
    expect(result).toEqual([ids.boardNew]);
    // Old record gone; exactly one card per original survives, repointed
    expect(await cardBoardId(orphan.id)).toBeUndefined();
    const allCards = (await db.query(cards, {})).records;
    expect(allCards).toHaveLength(2);
    expect(allCards.every((c) => c.boardId === ids.boardNew)).toBe(true);
    expect(loadMarkers()).toHaveLength(0);
  });

  it("remaps card columnIds through the marker's column map during recovery", async () => {
    const ids = makeIds();
    await putBoard(ids.boardNew);
    await putColumn(ids.colNew1, ids.boardNew);
    await putCard(uid("card"), ids.old, ids.colOld1);

    saveMarker(makeMarker(ids, { newBoardId: ids.boardNew }));
    await reconcileBoardMoves(db as never);

    // The stray is moved with its columnId remapped to the new column
    const allCards = (await db.query(cards, {})).records;
    expect(allCards).toHaveLength(1);
    expect(allCards[0]!.columnId).toBe(ids.colNew1);
  });

  it("branches on space: shared-space strays are patched, personal-space strays are moved", async () => {
    // Fake structural db — the raw adapter cannot attach _spaceId to
    // schema-validated records, and the branch is the load-bearing fix:
    // a patch never leaves the sharer's personal space, so invitees would
    // never see it (review S5).
    const ids = makeIds();
    const ops: string[] = [];
    const sharedCard = { id: "c-shared", boardId: ids.old, columnId: "col-x", _spaceId: SPACE };
    const personalCard = { id: "c-personal", boardId: ids.old, columnId: ids.colOld1 };
    const fakeDb = {
      get: async (_c: unknown, id: string) =>
        id === ids.old ? { id, name: "b", createdAt: "2026-09-21T10:00:00.000Z" } : undefined,
      put: async (_c: unknown, data: Record<string, unknown>) => {
        ops.push(`put:${JSON.stringify(data)}`);
        return { id: "generated" };
      },
      patch: async (_c: unknown, data: Record<string, unknown>) => {
        ops.push(`patch:${JSON.stringify(data)}`);
      },
      delete: async (_c: unknown, id: string) => {
        ops.push(`delete:${id}`);
      },
      query: async (collection: unknown) => ({
        records:
          collection === cards
            ? [sharedCard, personalCard]
            : collection === columns
              ? []
              : [{ id: "board-maybe", createdAt: "2000-01-01T00:00:00.000Z", name: "other" }],
      }),
    };

    const marker = makeMarker(ids, { newBoardId: ids.boardNew });
    const result = await completeBoardMove(fakeDb as never, marker);

    expect(result).toBe(ids.boardNew);
    // Shared-space stray: patched in place
    expect(ops).toContain(`patch:{"id":"c-shared","boardId":"${ids.boardNew}"}`);
    // Personal-space stray (no _spaceId): moved into the target space with
    // its columnId remapped
    expect(ops).toContain("delete:c-personal");
    expect(ops).toContain(`put:{"boardId":"${ids.boardNew}","columnId":"${ids.colNew1}"}`);
  });

  it("recovers a crash before the board move: creates the board, tombstones the old, patches children", async () => {
    const ids = makeIds();
    await putBoard(ids.old, "2026-09-21T10:00:00.000Z");
    const col = await putColumn(uid("col"), ids.old); // moved child, FK not rewritten

    saveMarker(makeMarker(ids));

    const [newBoardId] = await reconcileBoardMoves(db as never);
    expect(newBoardId).toBeDefined();
    expect(newBoardId).not.toBe(ids.old);

    expect(await boardIdOf(ids.old)).toBeUndefined();
    expect(await boardIdOf(newBoardId!)).toBe(newBoardId);
    // Adoption fingerprints the created copy by createdAt — the move must
    // preserve it for the crash-between-create-and-record state to resolve
    expect(new Date((await db.get(boards, newBoardId!))!.createdAt).getTime()).toBe(
      new Date("2026-09-21T10:00:00.000Z").getTime(),
    );
    // The stray column (personal space, no _spaceId) is MOVED and repointed
    expect((await db.get(columns, col.id))?.id).toBeUndefined();
    const allColumns = (await db.query(columns, {})).records;
    expect(allColumns).toHaveLength(1);
    expect(allColumns[0]!.boardId).toBe(newBoardId);
    expect(loadMarkers()).toHaveLength(0);
  });

  it("recovers a crash between board creation and marker update: adopts the created board instead of duplicating it", async () => {
    const ids = makeIds();
    await putBoard(ids.old, "2026-09-21T10:00:00.000Z"); // not yet tombstoned
    // The created copy preserves createdAt — that is what makes it adoptable
    await putBoard(ids.boardNew, "2026-09-21T10:00:00.000Z");
    const col = await putColumn(uid("col"), ids.old);

    saveMarker(makeMarker(ids)); // newBoardId: null

    const [newBoardId] = await reconcileBoardMoves(db as never);
    expect(newBoardId).toBe(ids.boardNew);

    // Exactly one live board remains, and it is the adopted one
    const live = (await db.query(boards, {})).records;
    expect(live.map((b) => b.id)).toEqual([ids.boardNew]);
    // The stray column is moved and repointed to the adopted board
    expect((await db.get(columns, col.id))?.id).toBeUndefined();
    const allColumns = (await db.query(columns, {})).records;
    expect(allColumns).toHaveLength(1);
    expect(allColumns[0]!.boardId).toBe(ids.boardNew);
  });

  it("moves children that were listed but never moved (crash mid-children)", async () => {
    const ids = makeIds();
    await putBoard(ids.old, "2026-09-21T10:00:00.000Z");
    const col = await putColumn(ids.colOld1, ids.old); // never moved
    const card = await putCard(uid("card"), ids.old, ids.colOld1); // never moved

    saveMarker(makeMarker(ids, { childIds: { columns: [col.id], cards: [card.id] } }));

    const [newBoardId] = await reconcileBoardMoves(db as never);

    // Old records tombstoned; recovered entities reference the new board and
    // the remapped column
    expect((await db.get(columns, col.id))?.id).toBeUndefined();
    const allColumns = (await db.query(columns, {})).records;
    expect(allColumns).toHaveLength(1);
    expect(allColumns[0]!.boardId).toBe(newBoardId);

    const allCards = (await db.query(cards, {})).records;
    expect(allCards).toHaveLength(1);
    expect(allCards[0]!.boardId).toBe(newBoardId);
    expect(allCards[0]!.columnId).toBe(ids.colNew1);
  });

  it("catches a child that arrived from sync after the share read (query-driven rewrite)", async () => {
    const ids = makeIds();
    await putBoard(ids.boardNew);
    const late = await putCard(uid("card"), ids.old, ids.colOld1);

    saveMarker(makeMarker(ids, { newBoardId: ids.boardNew })); // share never saw this card

    await reconcileBoardMoves(db as never);
    // The late card (personal space) is moved in and repointed
    expect(await cardBoardId(late.id)).toBeUndefined();
    const allCards = (await db.query(cards, {})).records;
    expect(allCards).toHaveLength(1);
    expect(allCards[0]!.boardId).toBe(ids.boardNew);
    expect(allCards[0]!.columnId).toBe(ids.colNew1);
  });

  it("recovery is idempotent: a second run finds nothing to do", async () => {
    const ids = makeIds();
    await putBoard(ids.boardNew);
    await putColumn(ids.colNew1, ids.boardNew);

    saveMarker(makeMarker(ids, { newBoardId: ids.boardNew }));
    await reconcileBoardMoves(db as never);
    expect(loadMarkers()).toHaveLength(0);

    expect(await reconcileBoardMoves(db as never)).toEqual([]);
  });

  it("a corrupt marker is dropped instead of crashing every mount", async () => {
    localStorage.setItem("betterbase.board-move.v1::junk", "{not json");
    expect(loadMarkers()).toHaveLength(0);
    expect(localStorage.getItem("betterbase.board-move.v1::junk")).toBeNull();
  });

  it("recovers a crash between persist-id and tombstone: the old board is still tombstoned (no ghost)", async () => {
    const ids = makeIds();
    await putBoard(ids.old, "2026-09-21T10:00:00.000Z"); // still alive
    await putBoard(ids.boardNew, "2026-09-21T10:00:00.000Z");
    await putColumn(uid("col"), ids.boardNew);

    // Marker already knows the new id — recovery must still delete the old
    saveMarker(makeMarker(ids, { newBoardId: ids.boardNew }));
    const [newBoardId] = await reconcileBoardMoves(db as never);
    expect(newBoardId).toBe(ids.boardNew);
    expect(await boardIdOf(ids.old)).toBeUndefined();
    const live = (await db.query(boards, {})).records;
    expect(live.map((b) => b.id)).toEqual([ids.boardNew]);
    expect(loadMarkers()).toHaveLength(0);
  });

  it("unresolvable markers are cleared instead of churning on every mount", async () => {
    const ids = makeIds();
    saveMarker(makeMarker(ids)); // board gone, nothing adoptable
    const result = await completeBoardMove(db as never, loadMarkers()[0]!);
    expect(result).toBeNull();
    expect(loadMarkers()).toHaveLength(0);
  });

  it("completeBoardMove returns null when nothing can be recovered", async () => {
    const ids = makeIds();
    // Board already tombstoned, target space empty, marker without new id —
    // the one state recovery cannot resolve (left for retry diagnostics)
    saveMarker(makeMarker(ids));
    const result = await completeBoardMove(db as never, loadMarkers()[0]!);
    expect(result).toBeNull();
  });

  it("clearMarker removes the durable record", async () => {
    const ids = makeIds();
    saveMarker(makeMarker(ids));
    clearMarker(ids.old);
    expect(loadMarkers()).toHaveLength(0);
  });
});
