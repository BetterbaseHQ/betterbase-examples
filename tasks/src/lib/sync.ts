/**
 * useLists — domain-specific sync hook for the Tasks app.
 *
 * Wraps useSpaces() sharing primitives with the lists collection to provide
 * a unified API for list management + sharing.
 *
 * Local mutations auto-sync via SyncEngine's db.onChange listener — no manual
 * scheduleSync() calls needed.
 *
 * Must be called inside BetterbaseProvider (authenticated path only).
 */

import { useMemo, useCallback } from "react";
import { useSyncDb, useSpaces, usePendingInvitations, useQuery } from "betterbase/sync/react";
import { shareTree, type SpaceFields } from "betterbase/sync";
import { lists, type List } from "@/lib/db";
import { createTodoOps } from "@/lib/todos";

export function useLists() {
  const db = useSyncDb();
  const spaces = useSpaces();
  const { invite } = spaces;

  const result = useQuery(lists, { sort: [{ field: "createdAt", direction: "asc" }] });
  const allLists = result.records;

  const invitations = usePendingInvitations();

  const todoOps = useMemo(() => createTodoOps(db), [db]);

  const createList = useCallback(
    async (name: string, color: string) => {
      await db.put(lists, { name, color, todos: [] });
    },
    [db],
  );

  const deleteList = useCallback(
    async (id: string) => {
      await db.delete(lists, id);
    },
    [db],
  );

  /**
   * Share a personal list with another user.
   * shareTree creates a new shared space, moves the list to it, and invites
   * the user. Returns the new list record (with a new ID in the shared space).
   */
  const shareList = useCallback(
    async (list: List & SpaceFields, handle: string): Promise<List & SpaceFields> => {
      const { parent: newList } = await shareTree(db, spaces, {
        collection: lists,
        id: list.id,
        invitee: handle,
        spaceName: list.name,
      });
      return newList as List & SpaceFields;
    },
    [db, spaces],
  );

  const inviteToList = useCallback(
    async (list: List & SpaceFields, handle: string) => {
      if (!list._spaceId) throw new Error("Cannot invite to a personal list");

      await invite(list._spaceId, handle, { spaceName: list.name });
    },
    [invite],
  );

  return {
    lists: allLists,
    /** False until the adapter's first emission — gates first-run UI. */
    listsLoaded: result.loaded,
    invitations: invitations.records,
    createList,
    deleteList,
    shareList,
    inviteToList,
    acceptInvitation: spaces.accept,
    declineInvitation: spaces.decline,
    removeMember: spaces.removeMember,
    isAdmin: spaces.isAdmin,
    todoOps,
  };
}
