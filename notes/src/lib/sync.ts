/**
 * useNotebooks — domain-specific sync hook for the Notes app.
 *
 * Wraps useSpaces() sharing primitives with the notebooks + notes collections
 * to provide a unified API for notebook management + sharing. Sharing uses
 * shareTree to move the notebook and its child notes into a shared space in
 * one call, with the notebookId FK rewritten to the new notebook ID.
 *
 * Local mutations auto-sync via SyncEngine's db.onChange listener — no manual
 * scheduleSync() calls needed.
 *
 * Must be called inside BetterbaseProvider (authenticated path only).
 */

import { useRef, useCallback } from "react";
import { useSyncDb, useSpaces, usePendingInvitations, useQuery } from "betterbase/sync/react";
import { shareTree, spaceOf, type SpaceFields } from "betterbase/sync";
import { notebooks, notes, type Notebook, type Note } from "@/lib/db";

export function useNotebooks() {
  const db = useSyncDb();
  const spaces = useSpaces();
  const { invite } = spaces;

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
   * shareTree creates a new shared space, moves the notebook and its child
   * notes to it (rewriting notebookId to the new notebook's ID), and invites
   * the user. Returns the new notebook record (with a new ID in the shared
   * space).
   */
  const shareNotebook = useCallback(
    async (
      notebook: Notebook & { _spaceId?: string },
      handle: string,
    ): Promise<Notebook & SpaceFields> => {
      const childNoteIds = allNotesRef.current
        .filter((n) => n.notebookId === notebook.id)
        .map((n) => n.id);

      const { parent: newNotebook } = await shareTree(db, spaces, {
        collection: notebooks,
        id: notebook.id,
        invitee: handle,
        spaceName: notebook.name,
        children: {
          collection: notes,
          ids: childNoteIds,
          overrides: (newParent) => ({ notebookId: (newParent as Notebook).id }),
        },
      });
      return newNotebook as Notebook & SpaceFields;
    },
    [db, spaces],
  );

  const inviteToNotebook = useCallback(
    async (notebook: Notebook & { _spaceId?: string }, handle: string) => {
      if (!notebook._spaceId) throw new Error("Cannot invite to a personal notebook");

      await invite(notebook._spaceId, handle, { spaceName: notebook.name });
    },
    [invite],
  );

  const createNote = useCallback(
    async (notebookId: string, notebook?: Notebook & { _spaceId?: string }) => {
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
    acceptInvitation: spaces.accept,
    declineInvitation: spaces.decline,
    removeMember: spaces.removeMember,
    isAdmin: spaces.isAdmin,
    createNote,
    updateNote,
    deleteNote,
  };
}
