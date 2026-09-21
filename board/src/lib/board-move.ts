/**
 * Durable board-share recovery (AUD-047).
 *
 * Sharing a board is a multi-record, multi-space sequence (move columns,
 * move cards, move board, rewrite boardId/columnId FKs). No transaction
 * spans it. If the process dies partway, children can end up referencing
 * the tombstoned old board — permanently invisible, since the app renders
 * children of the selected live board and a retry cannot move a tombstone
 * (bulkMoveToSpace throws on missing ids, so even a naive re-share fails).
 *
 * Recovery model: a marker persisted to localStorage describes the move
 * (old id, target space, column id map, child ids, and the new board id
 * once known). The board move itself is split so the marker always learns
 * the new board id before the old record is tombstoned:
 *
 *   1. bulk-move children (reconciliation re-derives partial progress)
 *   2. persist marker (newBoardId: null)
 *   3. db.put the new board in the shared space
 *   4. persist marker (newBoardId: <id>)    <- crash before: board adoptable
 *   5. db.delete the old board              <- crash before: harmless dup
 *   6. rewrite FKs of anything still referencing the old board id
 *   7. clear the marker
 *
 * Every crash point maps to a marker state that `completeBoardMove`
 * finishes deterministically; steps are idempotent, so re-running on an
 * already-recovered marker is a no-op that clears it. FK rewrites are
 * query-driven (patch anything with boardId === old), so children arriving
 * from sync mid-share are caught too, not just the ones the share read.
 *
 * Scope: the marker is device-local by design — only the browser that was
 * performing the move can be mid-move. The reconciliation patches are
 * ordinary CRDT ops, so peers converge as soon as this device runs the
 * reconciler (wired to app mount) and syncs.
 */

import { boards, columns, cards } from "@/lib/db";

/**
 * Structural view of the space-aware adapter — the real type's option
 * generics are middleware-derived; recovery only needs these five
 * operations. Cast once at the boundary (`as unknown as MoveDb`).
 */
interface MoveDb {
  get(collection: unknown, id: string): Promise<unknown>;
  put(
    collection: unknown,
    data: Record<string, unknown>,
    options?: { space?: string },
  ): Promise<{ id: string }>;
  patch(collection: unknown, data: Record<string, unknown>): Promise<unknown>;
  delete(collection: unknown, id: string): Promise<unknown>;
  query(collection: unknown, options: Record<string, unknown>): Promise<{ records: unknown[] }>;
}

const MARKER_PREFIX = "betterbase.board-move.v1::";

export interface BoardMoveMarker {
  /** The board being shared — tombstoned once step 5 completes. */
  oldBoardId: string;
  /** Target shared space (fresh per share). */
  spaceId: string;
  /** Old column id -> new column id, for card columnId rewrites. */
  columnIdMap: Record<string, string>;
  /** Column/card ids as of share start (old ids). */
  childIds: { columns: string[]; cards: string[] };
  /** The old board's createdAt (ISO) — identity fingerprint for adoption. */
  boardCreatedAt: string;
  /** The new board record's id; null until step 4. */
  newBoardId: string | null;
  createdAt: number;
}

function markerKey(oldBoardId: string): string {
  return `${MARKER_PREFIX}${oldBoardId}`;
}

export function saveMarker(marker: BoardMoveMarker): void {
  localStorage.setItem(markerKey(marker.oldBoardId), JSON.stringify(marker));
}

export function clearMarker(oldBoardId: string): void {
  localStorage.removeItem(markerKey(oldBoardId));
}

export function loadMarkers(): BoardMoveMarker[] {
  const markers: BoardMoveMarker[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === null || !key.startsWith(MARKER_PREFIX)) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(key)!) as BoardMoveMarker;
      if (parsed && typeof parsed.oldBoardId === "string") markers.push(parsed);
    } catch {
      // Corrupt marker — remove it rather than crash on every mount
      localStorage.removeItem(key);
    }
  }
  return markers;
}

/** Strip auto-managed identity fields so a record can be re-created. */
function recreatable(record: object): Record<string, unknown> {
  const { id: _id, _spaceId: _s, ...rest } = record as Record<string, unknown>;
  return rest;
}

/**
 * Finish (or re-finish) an interrupted share. Returns the new board id,
 * or null if recovery is not possible from the current state.
 */
export async function completeBoardMove(
  db: MoveDb,
  marker: BoardMoveMarker,
): Promise<string | null> {
  // Step A — move children that were listed but never moved (their old
  // records still exist and still belong to the old board). Ids that
  // already moved are tombstoned and skipped; their moved copies are
  // handled by the FK rewrite in step C.
  for (const columnId of marker.childIds.columns) {
    const column = (await db.get(columns, columnId)) as { boardId: string } | undefined;
    if (!column || column.boardId !== marker.oldBoardId) continue;
    await db.put(columns, recreatable(column), { space: marker.spaceId });
    await db.delete(columns, columnId);
  }
  for (const cardId of marker.childIds.cards) {
    const card = (await db.get(cards, cardId)) as
      | { boardId: string; columnId?: string }
      | undefined;
    if (!card || card.boardId !== marker.oldBoardId) continue;
    const fields = recreatable(card) as { columnId?: string };
    if (fields.columnId !== undefined && marker.columnIdMap[fields.columnId]) {
      fields.columnId = marker.columnIdMap[fields.columnId]!;
    }
    await db.put(cards, fields, { space: marker.spaceId });
    await db.delete(cards, cardId);
  }

  // Step B — establish the new board id. A crash between creating the new
  // board and recording its id leaves BOTH boards alive; distinguish the
  // created copy by its createdAt fingerprint (moves preserve createdAt),
  // not by space membership — the raw adapter has no space metadata.
  if (marker.newBoardId === null) {
    const candidates = (
      (await db.query(boards, {})).records as Array<{
        id: string;
        createdAt?: number;
      }>
    ).filter(
      (b) =>
        b.id !== marker.oldBoardId &&
        b.createdAt !== undefined &&
        new Date(b.createdAt).getTime() === new Date(marker.boardCreatedAt).getTime(),
    );
    if (candidates.length > 0) {
      marker.newBoardId = candidates[0]!.id;
      saveMarker(marker);
    } else {
      const board = (await db.get(boards, marker.oldBoardId)) as object | undefined;
      if (!board) return null;
      const newBoard = await db.put(boards, recreatable(board), {
        space: marker.spaceId,
      });
      marker.newBoardId = newBoard.id;
      saveMarker(marker);
    }
    await db.delete(boards, marker.oldBoardId).catch(() => {
      // Already tombstoned — the state we adopted from
    });
  }

  // Step C — rewrite FKs of everything still referencing the old board.
  // Matching is done in JS rather than via query filters: the raw local
  // adapter does not implement them (only the middleware layer does), and a
  // recovery path must not depend on adapter capabilities.
  const newBoardId = marker.newBoardId;
  const strayColumns = (
    (await db.query(columns, {})).records as Array<{ id: string; boardId?: string }>
  ).filter((c) => c.boardId === marker.oldBoardId);
  for (const column of strayColumns) {
    await db.patch(columns, { id: column.id, boardId: newBoardId! });
  }
  const strayCards = (
    (await db.query(cards, {})).records as Array<{
      id: string;
      boardId?: string;
      columnId?: string;
    }>
  ).filter((c) => c.boardId === marker.oldBoardId);
  for (const card of strayCards) {
    const fields: { id: string; boardId: string; columnId?: string } = {
      id: card.id,
      boardId: newBoardId!,
    };
    if (card.columnId !== undefined && marker.columnIdMap[card.columnId]) {
      fields.columnId = marker.columnIdMap[card.columnId]!;
    }
    await db.patch(cards, fields);
  }

  // Patches are awaited — reaching here means every rewrite succeeded, so
  // the move has fully converged and the marker can go. A failure above
  // throws out and deliberately leaves the marker for the next mount.
  void strayColumns;
  void strayCards;
  clearMarker(marker.oldBoardId);
  return newBoardId;
}

/** Reconcile every interrupted share (app mount). Returns new board ids. */
export async function reconcileBoardMoves(db: MoveDb): Promise<string[]> {
  const completed: string[] = [];
  for (const marker of loadMarkers()) {
    const newBoardId = await completeBoardMove(db, marker);
    if (newBoardId !== null) completed.push(newBoardId);
  }
  return completed;
}
