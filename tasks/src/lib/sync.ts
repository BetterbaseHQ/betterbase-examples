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

import { useRef, useCallback } from "react";
import { useSyncDb, useSpaces, usePendingInvitations, useQuery } from "betterbase/sync/react";
import { moveToSpace, type SpaceFields } from "betterbase/sync";
import { lists, type List } from "@/lib/db";

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

  // Per-list write serialization: prevents read-modify-write races on todos array.
  const mutexRef = useRef<Map<string, Promise<void>>>(new Map());

  const withMutex = useCallback((listId: string, fn: () => Promise<void>) => {
    const current = mutexRef.current.get(listId) ?? Promise.resolve();
    const next = current.then(fn);
    // Don't let errors block future mutations
    mutexRef.current.set(
      listId,
      next.catch(() => {}),
    );
    return next;
  }, []);

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
      return newList as List & SpaceFields;
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

  const addTodo = useCallback(
    (listId: string, text: string) => {
      return withMutex(listId, async () => {
        const list = await db.get(lists, listId);
        if (!list) return;
        await db.patch(lists, {
          id: listId,
          todos: [...list.todos, { id: crypto.randomUUID(), text, completed: false }],
        });
      });
    },
    [db, withMutex],
  );

  const toggleTodo = useCallback(
    (listId: string, todoId: string) => {
      return withMutex(listId, async () => {
        const list = await db.get(lists, listId);
        if (!list) return;
        await db.patch(lists, {
          id: listId,
          todos: list.todos.map((t) => (t.id === todoId ? { ...t, completed: !t.completed } : t)),
        });
      });
    },
    [db, withMutex],
  );

  const deleteTodo = useCallback(
    (listId: string, todoId: string) => {
      return withMutex(listId, async () => {
        const list = await db.get(lists, listId);
        if (!list) return;
        await db.patch(lists, {
          id: listId,
          todos: list.todos.filter((t) => t.id !== todoId),
        });
      });
    },
    [db, withMutex],
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
    addTodo,
    toggleTodo,
    deleteTodo,
  };
}
