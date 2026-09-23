/**
 * useBoards — domain-specific sync hook for the Board app.
 *
 * Boards, columns, and cards are separate records so every mutation is an
 * independent CRDT write (see collections.ts). Sharing a board moves all three
 * to a shared space, remapping the boardId and columnId foreign keys to the
 * new record ids.
 *
 * Must be called inside BetterbaseProvider (authenticated path only).
 */

import { useRef, useCallback, useEffect } from "react";
import { useSyncDb, useSpaces, usePendingInvitations, useQuery } from "betterbase/sync/react";
import { deleteTree, bulkMoveToSpace, spaceOf, type SpaceFields } from "betterbase/sync";
import { boards, columns, cards, type Board, type Card, type Column } from "@/lib/db";
import {
  saveMarker,
  clearMarker,
  completeBoardMove,
  reconcileBoardMoves,
  type BoardMoveMarker,
} from "@/lib/board-move";

export function useBoards() {
  const db = useSyncDb();
  const {
    userExists,
    createSpace,
    invite,
    accept: acceptInvitation,
    decline: declineInvitation,
    removeMember,
    isAdmin,
  } = useSpaces();

  const boardResult = useQuery(boards, {
    sort: [
      { field: "createdAt", direction: "asc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allBoards = boardResult.records;

  const columnResult = useQuery(columns, {
    sort: [
      { field: "sortOrder", direction: "asc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allColumns = columnResult.records;

  const cardResult = useQuery(cards, {
    sort: [
      { field: "order", direction: "asc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allCards = cardResult.records;

  const invitations = usePendingInvitations();

  // Refs for stable callbacks that need fresh data
  // Keep a ref to allColumns to avoid stale closure in addColumn
  const allColumnsRef = useRef(allColumns);
  allColumnsRef.current = allColumns;

  const createBoard = useCallback(
    async (name: string, id?: string) => {
      const board = await db.put(boards, { name }, id ? { id } : undefined);
      const defaults = ["To Do", "In Progress", "Done"];
      for (let i = 0; i < defaults.length; i++) {
        await db.put(columns, { boardId: board.id, name: defaults[i]!, sortOrder: i + 1 });
      }
      return board;
    },
    [db],
  );

  const deleteBoard = useCallback(
    async (id: string) => {
      // Cascade covers columns and cards (declared parent edges).
      await deleteTree(db, boards, id);
    },
    [db],
  );

  const addColumn = useCallback(
    async (board: Board & { _spaceId?: string }, name: string) => {
      const boardColumns = allColumnsRef.current.filter((c) => c.boardId === board.id);
      const maxOrder = boardColumns.reduce((max, c) => Math.max(max, c.sortOrder), 0);
      await db.put(columns, { boardId: board.id, name, sortOrder: maxOrder + 1 }, spaceOf(board));
    },
    [db],
  );

  const renameColumn = useCallback(
    async (columnId: string, name: string) => {
      await db.patch(columns, { id: columnId, name });
    },
    [db],
  );

  /** Delete a column and all cards in it. */
  const deleteColumn = useCallback(
    async (columnId: string) => {
      await deleteTree(db, columns, columnId);
    },
    [db],
  );

  // Recover any share interrupted by a crash/reload before doing anything
  // else — otherwise its children can reference a tombstoned board forever
  // (AUD-047). Runs once per mount; safe when nothing is pending.
  useEffect(() => {
    reconcileBoardMoves(db as unknown as Parameters<typeof reconcileBoardMoves>[0]).catch((err) => {
      console.error("Board share reconciliation failed", err);
    });
  }, [db]);

  /**
   * Share a personal board with another user.
   *
   * Children move first (remapping columnId FKs), then the board, then the
   * boardId FKs — under a durable marker so an interruption at ANY point is
   * recovered on next mount by completeBoardMove (see board-move.ts for the
   * crash-state map). The invite happens after the data has fully moved; a
   * failure there leaves the data correct and is retryable via the UI.
   */
  const shareBoard = useCallback(
    async (board: Board & { _spaceId?: string }, handle: string): Promise<Board & SpaceFields> => {
      const exists = await userExists(handle);
      if (!exists) throw new Error(`User "${handle}" not found`);

      const spaceId = await createSpace();

      // Read children fresh (not from render state) so columns/cards arriving
      // from sync during the share are included
      const boardColumns = (await db.query(columns, { filter: { boardId: board.id } })).records;
      const boardCards = (await db.query(cards, { filter: { boardId: board.id } })).records;

      const newColumns = await bulkMoveToSpace(
        db,
        columns,
        boardColumns.map((c) => c.id),
        spaceId,
      );
      const columnIdMap = new Map(boardColumns.map((c, i) => [c.id, newColumns[i]!.id]));

      await bulkMoveToSpace(
        db,
        cards,
        boardCards.map((c) => c.id),
        spaceId,
        (card) => ({
          columnId: columnIdMap.get(card.columnId) ?? card.columnId,
        }),
      );

      // Durable marker from here on: any crash is recoverable
      const marker: BoardMoveMarker = {
        oldBoardId: board.id,
        spaceId,
        columnIdMap: Object.fromEntries(columnIdMap),
        childIds: {
          columns: boardColumns.map((c) => c.id),
          cards: boardCards.map((c) => c.id),
        },
        boardCreatedAt: new Date(board.createdAt).toISOString(),
        boardName: board.name,
        newBoardId: null,
        createdAt: Date.now(),
      };
      saveMarker(marker);

      const newBoardId = await completeBoardMove(
        db as unknown as Parameters<typeof completeBoardMove>[0],
        marker,
      );
      if (newBoardId === null) {
        clearMarker(board.id);
        throw new Error("Board share could not be completed");
      }

      await invite(spaceId, handle, { spaceName: board.name });
      return (await db.get(boards, newBoardId)) as Board & SpaceFields;
    },
    [db, userExists, createSpace, invite],
  );

  const inviteToBoard = useCallback(
    async (board: Board & { _spaceId?: string }, handle: string) => {
      if (!board._spaceId) throw new Error("Cannot invite to a personal board");

      await invite(board._spaceId, handle, { spaceName: board.name });
    },
    [invite],
  );

  /** Add a card to a column in the correct space for the given board. */
  const addCard = useCallback(
    async (
      board: Board & { _spaceId?: string },
      columnId: string,
      title: string,
      description: string,
      order: number,
    ) => {
      await db.put(
        cards,
        { boardId: board.id, columnId, title, description, color: "", order },
        spaceOf(board),
      );
    },
    [db],
  );

  /** Delete a set of cards (e.g. when deleting a column). */
  const deleteCards = useCallback(
    async (ids: string[]) => {
      await Promise.all(ids.map((id) => db.delete(cards, id)));
    },
    [db],
  );

  /** Move a card to a different column / position (drag-and-drop). */
  const moveCard = useCallback(
    async (id: string, columnId: string, order: number) => {
      await db.patch(cards, { id, columnId, order });
    },
    [db],
  );

  return {
    boards: allBoards,
    columns: allColumns,
    cards: allCards,
    invitations: invitations.records,
    createBoard,
    deleteBoard,
    addColumn,
    renameColumn,
    deleteColumn,
    shareBoard,
    inviteToBoard,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
    addCard,
    deleteCards,
    moveCard,
  };
}

export type { Board, Column, Card };
