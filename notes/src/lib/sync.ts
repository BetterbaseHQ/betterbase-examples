/**
 * useNotebooks — domain-specific sync hook for the Notes app.
 *
 * Wraps useSpaces() sharing primitives with the notebooks + notes collections
 * to provide a unified API for notebook management + sharing. Child notes are
 * migrated to the shared space on share via bulkMoveToSpace, with the
 * notebookId FK updated to point to the new notebook ID.
 *
 * Local mutations auto-sync via SyncEngine's db.onChange listener — no manual
 * scheduleSync() calls needed.
 *
 * Must be called inside LessProvider (authenticated path only).
 */

import { useRef, useCallback } from "react";
import { useSyncDb, useSpaces, usePendingInvitations, useQuery } from "@betterbase/sdk/sync/react";
import { moveToSpace, bulkMoveToSpace, spaceOf, type SpaceFields } from "@betterbase/sdk/sync";
import { notebooks, notes, type Notebook, type Note } from "@/lib/db";

export function useNotebooks() {
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

  const notebookResult = useQuery(notebooks, {
    sort: [{ field: "sortOrder", direction: "asc" }],
  });
  const allNotebooks = notebookResult.records;

  const noteResult = useQuery(notes, {
    sort: [{ field: "updatedAt", direction: "desc" }],
  });
  const allNotes = noteResult.records;

  const invitations = usePendingInvitations();

  // Keep a ref to allNotes to avoid stale closure in shareNotebook/deleteNotebook
  const allNotesRef = useRef(allNotes);
  allNotesRef.current = allNotes;

  const createNotebook = useCallback(
    async (name: string) => {
      const maxOrder = allNotebooks.reduce((max, nb) => Math.max(max, nb.sortOrder), 0);
      // @ts-expect-error TS2589: type depth limit
      await db.put(notebooks, { name, sortOrder: maxOrder + 1 });
    },
    [db, allNotebooks],
  );

  const deleteNotebook = useCallback(
    async (id: string) => {
      const childNotes = allNotesRef.current.filter((n) => n.notebookId === id);
      await Promise.all(childNotes.map((n) => db.delete(notes, n.id)));
      await db.delete(notebooks, id);
    },
    [db],
  );

  /**
   * Share a personal notebook with another user.
   * Creates a new shared space, moves the notebook to it, migrates all child
   * notes (with updated notebookId FK), and invites the user.
   */
  const shareNotebook = useCallback(
    async (notebook: Notebook & SpaceFields, handle: string): Promise<Notebook & SpaceFields> => {
      const exists = await userExists(handle);
      if (!exists) throw new Error(`User "${handle}" not found`);

      const spaceId = await createSpace();
      const newNotebook = await moveToSpace(db, notebooks, notebook.id, spaceId);

      const childNoteIds = allNotesRef.current
        .filter((n) => n.notebookId === notebook.id)
        .map((n) => n.id);
      await bulkMoveToSpace(db, notes, childNoteIds, spaceId, {
        notebookId: newNotebook.id,
      });

      await invite(spaceId, handle, { spaceName: notebook.name });
      return newNotebook;
    },
    [db, userExists, createSpace, invite],
  );

  const inviteToNotebook = useCallback(
    async (notebook: Notebook & SpaceFields, handle: string) => {
      if (!notebook._spaceId) throw new Error("Cannot invite to a personal notebook");

      await invite(notebook._spaceId, handle, { spaceName: notebook.name });
    },
    [invite],
  );

  const createNote = useCallback(
    async (notebookId: string, notebook?: Notebook & SpaceFields) => {
      const record = await db.put(
        notes,
        { notebookId, title: "", body: "", pinned: false, favorite: false },
        notebook ? spaceOf(notebook) : undefined,
      );
      return record;
    },
    [db],
  );

  const updateNote = useCallback(
    async (id: string, patch: Partial<Omit<Note, "id" | "createdAt" | "updatedAt">>) => {
      await db.patch(notes, { id, ...patch });
    },
    [db],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      await db.delete(notes, id);
    },
    [db],
  );

  return {
    notebooks: allNotebooks,
    notes: allNotes,
    invitations: invitations.records,
    createNotebook,
    deleteNotebook,
    shareNotebook,
    inviteToNotebook,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
    createNote,
    updateNote,
    deleteNote,
  };
}
