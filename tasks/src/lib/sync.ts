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
import { moveToSpace, type SpaceFields } from "betterbase/sync";
import { lists, type List } from "@/lib/db";
import { createTodoOps } from "@/lib/todos";

export function useLists() {
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

  const result = useQuery(lists, { sort: [{ field: "createdAt", direction: "asc" }] });
  const allLists = result.records;

  const invitations = usePendingInvitations();

  const todoOps = useMemo(() => createTodoOps(db), [db]);

  const createList = useCallback(
    async (name: string, color: string) => {
      // @ts-expect-error TS2589: type depth limit
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
   * Creates a new shared space, moves the list to it, and invites the user.
   * Returns the new list record (with a new ID in the shared space).
   */
  const shareList = useCallback(
    async (list: List & SpaceFields, handle: string): Promise<List & SpaceFields> => {
      const exists = await userExists(handle);
      if (!exists) throw new Error(`User "${handle}" not found`);
      const spaceId = await createSpace();
      const newList = await moveToSpace(db, lists, list.id, spaceId);
      await invite(spaceId, handle, { spaceName: list.name });
      return newList;
    },
    [db, userExists, createSpace, invite],
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
    invitations: invitations.records,
    createList,
    deleteList,
    shareList,
    inviteToList,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
    todoOps,
  };
}
