/**
 * useBoards — domain-specific sync hook for the Board app.
 *
 * Wraps useSpaces() sharing primitives with the boards + cards collections to
 * provide a unified API for board management + sharing. Child cards are
 * migrated to the shared space on share via bulkMoveToSpace, with the
 * boardId FK updated to point to the new board ID.
 *
 * Local mutations auto-sync via SyncEngine's db.onChange listener — no manual
 * scheduleSync() calls needed.
 *
 * Must be called inside LessProvider (authenticated path only).
 */

import { useRef, useCallback } from "react";
import { useSyncDb, useSpaces, usePendingInvitations, useQuery } from "@betterbase/sdk/sync/react";
import { moveToSpace, bulkMoveToSpace, spaceOf, type SpaceFields } from "@betterbase/sdk/sync";
import { boards, cards, type Board, type Card } from "@/lib/db";

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
    sort: [{ field: "createdAt", direction: "asc" }],
  });
  const allBoards = boardResult.records;

  const cardResult = useQuery(cards, {
    sort: [{ field: "order", direction: "asc" }],
  });
  const allCards = cardResult.records;

  const invitations = usePendingInvitations();

  // Keep a ref to allCards to avoid stale closure in shareBoard/deleteBoard
  const allCardsRef = useRef(allCards);
  allCardsRef.current = allCards;

  const createBoard = useCallback(
    async (name: string) => {
      const defaultColumns = [
        { id: crypto.randomUUID(), name: "To Do" },
        { id: crypto.randomUUID(), name: "In Progress" },
        { id: crypto.randomUUID(), name: "Done" },
      ];
      // @ts-expect-error TS2589: type depth limit
      const record = await db.put(boards, { name, columns: defaultColumns });
      return record;
    },
    [db],
  );

  const deleteBoard = useCallback(
    async (id: string) => {
      const boardCards = allCardsRef.current.filter((c) => c.boardId === id);
      await Promise.all(boardCards.map((c) => db.delete(cards, c.id)));
      await db.delete(boards, id);
    },
    [db],
  );

  const updateBoard = useCallback(
    async (id: string, patch: Partial<Omit<Board, "id" | "createdAt" | "updatedAt">>) => {
      await db.patch(boards, { id, ...patch });
    },
    [db],
  );

  /**
   * Share a personal board with another user.
   * Creates a new shared space, moves the board to it, migrates all child
   * cards (with updated boardId FK), and invites the user.
   */
  const shareBoard = useCallback(
    async (board: Board & SpaceFields, handle: string): Promise<Board & SpaceFields> => {
      const exists = await userExists(handle);
      if (!exists) throw new Error(`User "${handle}" not found`);

      const spaceId = await createSpace();
      const newBoard = await moveToSpace(db, boards, board.id, spaceId);

      const boardCardIds = allCardsRef.current
        .filter((c) => c.boardId === board.id)
        .map((c) => c.id);
      await bulkMoveToSpace(db, cards, boardCardIds, spaceId, {
        boardId: newBoard.id,
      });

      await invite(spaceId, handle, { spaceName: board.name });
      return newBoard;
    },
    [db, userExists, createSpace, invite],
  );

  const inviteToBoard = useCallback(
    async (board: Board & SpaceFields, handle: string) => {
      if (!board._spaceId) throw new Error("Cannot invite to a personal board");

      await invite(board._spaceId, handle, { spaceName: board.name });
    },
    [invite],
  );

  /** Add a card to a column in the correct space for the given board. */
  const addCard = useCallback(
    async (
      board: Board & SpaceFields,
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
    cards: allCards,
    invitations: invitations.records,
    createBoard,
    deleteBoard,
    updateBoard,
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

// Re-export Card type for consumers
export type { Card };
