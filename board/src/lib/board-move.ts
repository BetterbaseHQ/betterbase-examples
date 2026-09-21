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
 *   5. db.delete the old board              <- crash before: reconciler
 *                                             still tombstones it
 *   6. rewrite FKs / move anything still referencing the old board id
 *   7. clear the marker
 *
 * Every crash point maps to a marker state that `completeBoardMove`
 * finishes deterministically; steps are idempotent, so re-running on an
 * already-recovered marker is a no-op that clears it. Strays found in the
 * FK pass are MOVED when they live outside the target space (a patch would
 * only sync within the sharer's personal space and never reach the
 * invitee), and patched when already there. Matching is done in JS rather
 * than via query filters: the raw local adapter does not implement them.
 *
 * Scope: the marker is device-local by design — only the browser that was
 * performing the move can be mid-move. The reconciliation patches are
 * ordinary CRDT ops, so peers converge as soon as this device runs the
 * reconciler (wired to app mount) and syncs.
 */

import { boards, columns, cards } from "@/lib/db";

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
  /** The old board's name — secondary adoption signal. */
  boardName: string | null;
  /** The new board record's id; null until step 4. */
  newBoardId: string | null;
  createdAt: number;
}

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
  // Collect keys first: removing a corrupt marker mid-iteration would
  // shift localStorage's indices and skip the next key.
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && key.startsWith(MARKER_PREFIX)) keys.push(key);
  }
  const markers: BoardMoveMarker[] = [];
  for (const key of keys) {
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

/** Rewrites a card's columnId through the marker's column map, in place. */
function remapColumnId(fields: { columnId?: string }, marker: BoardMoveMarker): void {
  if (fields.columnId !== undefined && marker.columnIdMap[fields.columnId] !== undefined) {
    fields.columnId = marker.columnIdMap[fields.columnId]!;
  }
}

// Completions are serialized process-wide: the mount reconciler and a
// user-initiated share (or React StrictMode's double effect) can otherwise
// both take the create branch of the board step and produce two boards.
let completionChain: Promise<unknown> = Promise.resolve();

function serialized<T>(run: () => Promise<T>): Promise<T> {
  const result = completionChain.then(run, run);
  completionChain = result.catch(() => undefined);
  return result;
}

/**
 * Finish (or re-finish) an interrupted share. Returns the new board id,
 * or null if recovery is not possible from the current state (the marker
 * is then cleared — nothing later would resolve it either).
 */
export function completeBoardMove(db: MoveDb, marker: BoardMoveMarker): Promise<string | null> {
  return serialized(() => completeBoardMoveLocked(db, marker));
}

async function completeBoardMoveLocked(
  db: MoveDb,
  marker: BoardMoveMarker,
): Promise<string | null> {
  // Step A — move children that were listed but never moved (their old
  // records still exist and still belong to the old board). Ids that
  // already moved are tombstoned and skipped; their moved copies are
  // handled by the FK pass in step C.
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
    remapColumnId(fields, marker);
    await db.put(cards, fields, { space: marker.spaceId });
    await db.delete(cards, cardId);
  }

  // Step B — establish the new board id. A crash between creating the new
  // board and recording its id leaves BOTH boards alive; distinguish the
  // created copy by its createdAt fingerprint (moves preserve createdAt)
  // plus name when known, not by space membership — the raw adapter has no
  // space metadata. Ambiguous fingerprints refuse adoption rather than
  // guess (the conservative branch below creates + tombstones instead).
  if (marker.newBoardId === null) {
    const candidates = (
      (await db.query(boards, {})).records as Array<{
        id: string;
        createdAt?: number | string;
        name?: string;
      }>
    ).filter((b) => {
      if (b.id === marker.oldBoardId || b.createdAt === undefined) return false;
      const sameInstant =
        new Date(b.createdAt).getTime() === new Date(marker.boardCreatedAt).getTime();
      const sameName = marker.boardName === null || b.name === marker.boardName;
      return sameInstant && sameName;
    });
    if (candidates.length === 1) {
      marker.newBoardId = candidates[0]!.id;
      saveMarker(marker);
    } else if (candidates.length === 0) {
      const board = (await db.get(boards, marker.oldBoardId)) as object | undefined;
      if (!board) {
        // Nothing to move and nothing adoptable — unresolvable; drop the
        // marker so it cannot churn on every mount (including under other
        // accounts' scopes).
        clearMarker(marker.oldBoardId);
        return null;
      }
      const newBoard = await db.put(boards, recreatable(board), {
        space: marker.spaceId,
      });
      marker.newBoardId = newBoard.id;
      saveMarker(marker);
    } else {
      // Ambiguous adoption — refuse to guess which board is the moved copy
      clearMarker(marker.oldBoardId);
      return null;
    }
  }

  // Always tombstone the old board (a crash between steps 4 and 5 leaves
  // it alive as a childless duplicate otherwise). Already-tombstoned is
  // the normal state here — the catch is load-bearing, not defensive.
  await db.delete(boards, marker.oldBoardId).catch(() => undefined);

  // Step C — converge everything still referencing the old board. Strays
  // already in the target space are patched (their peers see the patch);
  // strays outside it — including personal-space records, which carry no
  // _spaceId in the raw adapter — are MOVED, because a patch syncs only
  // within the space the record lives in and would never reach invitees.
  const newBoardId = marker.newBoardId;

  const strayColumns = (
    (await db.query(columns, {})).records as Array<{
      id: string;
      boardId?: string;
      _spaceId?: string;
    }>
  ).filter((c) => c.boardId === marker.oldBoardId);
  for (const column of strayColumns) {
    if (column._spaceId === marker.spaceId) {
      await db.patch(columns, { id: column.id, boardId: newBoardId! });
    } else {
      const { id: _id, _spaceId: _s, ...rest } = column as Record<string, unknown>;
      await db.put(
        columns,
        { ...rest, boardId: newBoardId! },
        {
          space: marker.spaceId,
        },
      );
      await db.delete(columns, column.id);
    }
  }

  const strayCards = (
    (await db.query(cards, {})).records as Array<{
      id: string;
      boardId?: string;
      columnId?: string;
      _spaceId?: string;
    }>
  ).filter((c) => c.boardId === marker.oldBoardId);
  for (const card of strayCards) {
    const fields: Record<string, unknown> = { boardId: newBoardId };
    if (card._spaceId === marker.spaceId) {
      remapColumnId(fields as { columnId?: string }, marker);
      await db.patch(cards, { id: card.id, ...fields });
    } else {
      // Remap on the MERGED record — the card's original columnId lives in
      // its own fields, not in the FK overrides
      const { id: _id, _spaceId: _s, ...rest } = card as Record<string, unknown>;
      const moved = { ...rest, ...fields } as { columnId?: string };
      remapColumnId(moved, marker);
      await db.put(cards, moved, { space: marker.spaceId });
      await db.delete(cards, card.id);
    }
  }

  // Reaching here means every step succeeded — the move has fully
  // converged and the marker can go. A failure above throws out and
  // deliberately leaves the marker for the next mount.
  clearMarker(marker.oldBoardId);
  return newBoardId;
}

/** Reconcile every interrupted share (app mount). Returns new board ids. */
export function reconcileBoardMoves(db: MoveDb): Promise<string[]> {
  return serialized(async () => {
    const completed: string[] = [];
    for (const marker of loadMarkers()) {
      const newBoardId = await completeBoardMoveLocked(db, marker);
      if (newBoardId !== null) completed.push(newBoardId);
    }
    return completed;
  });
}
