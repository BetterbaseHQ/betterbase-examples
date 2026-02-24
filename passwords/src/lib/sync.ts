/**
 * useEntries — domain-specific sync hook for the Passwords app.
 *
 * Wraps useSpaces() sharing primitives with the entries collection to provide
 * a unified API for password entry management + sharing. Passwords has a
 * single collection (no parent-child structure), so sharing is per-entry.
 *
 * Local mutations auto-sync via SyncEngine's db.onChange listener — no manual
 * scheduleSync() calls needed.
 *
 * Must be called inside BetterbaseProvider (authenticated path only).
 */

import { useCallback } from "react";
import { useSyncDb, useSpaces, usePendingInvitations, useQuery } from "betterbase/sync/react";
import { moveToSpace, type SpaceFields } from "betterbase/sync";
import { entries, type Entry } from "@/lib/db";

export function useEntries() {
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

  const result = useQuery(entries, {
    sort: [{ field: "site", direction: "asc" }],
  });
  const allEntries = result.records;

  const invitations = usePendingInvitations();

  const createEntry = useCallback(
    async (data: Omit<Entry, "id" | "createdAt" | "updatedAt">) => {
      await db.put(entries, data);
    },
    [db],
  );

  const updateEntry = useCallback(
    async (data: { id: string } & Omit<Entry, "id" | "createdAt" | "updatedAt">) => {
      await db.patch(entries, data);
    },
    [db],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      await db.delete(entries, id);
    },
    [db],
  );

  /**
   * Share a personal entry with another user.
   * Creates a new shared space, moves the entry to it, and invites the user.
   * Returns the new entry record (with a new ID in the shared space).
   */
  const shareEntry = useCallback(
    async (entry: Entry & SpaceFields, handle: string): Promise<Entry & SpaceFields> => {
      const exists = await userExists(handle);
      if (!exists) throw new Error(`User "${handle}" not found`);

      const spaceId = await createSpace();
      const newEntry = await moveToSpace(db, entries, entry.id, spaceId);
      await invite(spaceId, handle, { spaceName: entry.site });
      return newEntry as Entry & SpaceFields;
    },
    [db, userExists, createSpace, invite],
  );

  const inviteToEntry = useCallback(
    async (entry: Entry & SpaceFields, handle: string) => {
      if (!entry._spaceId) throw new Error("Cannot invite to a personal entry");

      await invite(entry._spaceId, handle, { spaceName: entry.site });
    },
    [invite],
  );

  return {
    entries: allEntries,
    invitations: invitations.records,
    createEntry,
    updateEntry,
    deleteEntry,
    shareEntry,
    inviteToEntry,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
  };
}
