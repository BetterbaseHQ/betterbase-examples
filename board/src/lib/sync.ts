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

import { useRef, useCallback } from "react";
import { useSyncDb, useSpaces, usePendingInvitations, useQuery } from "betterbase/sync/react";
import {
  deleteTree,
  moveToSpace,
  bulkMoveToSpace,
  spaceOf,
  type SpaceFields,
} from "betterbase/sync";
import { boards, columns, cards, type Board, type Card, type Column } from "@/lib/db";

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
    async (name: string) => {
      const board = await db.put(boards, { name });
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

  /**
   * Share a personal board with another user.
   * Creates a new shared space, moves columns and cards first (remapping
   * columnId FKs), moves the board last, then patches boardId FKs and invites.
   *
   * Children-first ordering keeps every intermediate failure retryable: the
   * children keep the old boardId until the final patch, so the board keeps
   * rendering locally and a retry re-finds them by that id. (Moving the board
   * first would tombstone its record, orphaning children on any later failure.)
   * The sequence is still not transactional — a failure mid-share can leave
   * children temporarily in the shared space; a retry converges.
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

      const newCards = await bulkMoveToSpace(
        db,
        cards,
        boardCards.map((c) => c.id),
        spaceId,
        (card) => ({
          columnId: columnIdMap.get(card.columnId) ?? card.columnId,
        }),
      );

      const newBoard = await moveToSpace(db, boards, board.id, spaceId);

      // Point the moved children at the new board record (patches don't need
      // space routing)
      await Promise.all([
        ...newColumns.map((c) => db.patch(columns, { id: c.id, boardId: newBoard.id })),
        ...newCards.map((c) => db.patch(cards, { id: c.id, boardId: newBoard.id })),
      ]);

      await invite(spaceId, handle, { spaceName: board.name });
      return newBoard;
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
