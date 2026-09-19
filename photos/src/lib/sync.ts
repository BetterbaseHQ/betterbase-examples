/**
 * useAlbums — domain-specific sync hook for the Photos app.
 *
 * Wraps useSpaces() sharing primitives with the albums + photos collections to
 * provide a unified API for album management + sharing. Child photos are
 * migrated to the shared space on share via shareTree, with the albumId FK
 * updated to point to the new album ID.
 *
 * FileStore files sync automatically per-space via the shared space key —
 * no extra handling is needed here.
 *
 * Local mutations auto-sync via SyncEngine's db.onChange listener — no manual
 * scheduleSync() calls needed.
 *
 * Must be called inside BetterbaseProvider (authenticated path only).
 */

import { useRef, useCallback } from "react";
import { useSyncDb, useSpaces, usePendingInvitations, useQuery } from "betterbase/sync/react";
import { shareTree, spaceOf, type SpaceFields } from "betterbase/sync";
import { albums, photos, type Album, type Photo } from "@/lib/db";

export function useAlbums() {
  const db = useSyncDb();
  const spaces = useSpaces();
  const { accept: acceptInvitation, decline: declineInvitation, removeMember, isAdmin } = spaces;

  const albumResult = useQuery(albums, {
    sort: [
      { field: "sortOrder", direction: "asc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allAlbums = albumResult.records;

  const photoResult = useQuery(photos, {
    sort: [
      { field: "createdAt", direction: "desc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allPhotos = photoResult.records;

  const invitations = usePendingInvitations();

  // Keep a ref to allPhotos to avoid stale closure in shareAlbum/deleteAlbum
  const allPhotosRef = useRef(allPhotos);
  allPhotosRef.current = allPhotos;

  const createAlbum = useCallback(
    async (name: string) => {
      const maxOrder = allAlbums.reduce((max, a) => Math.max(max, a.sortOrder), 0);
      await db.put(albums, { name, sortOrder: maxOrder + 1 });
    },
    [db, allAlbums],
  );

  /** Delete an album and all its photo records. Caller is responsible for evicting files. */
  const deleteAlbum = useCallback(
    async (id: string) => {
      const albumPhotos = allPhotosRef.current.filter((p) => p.albumId === id);
      await Promise.all(albumPhotos.map((p) => db.delete(photos, p.id)));
      await db.delete(albums, id);
      return albumPhotos;
    },
    [db],
  );

  /**
   * Share a personal album with another user. shareTree creates a new shared
   * space, moves the album to it, migrates all child photos (with the albumId
   * FK rewritten to the album's new ID), and invites the user. Returns the
   * new album record (with a new ID in the shared space).
   */
  const shareAlbum = useCallback(
    async (album: Album & { _spaceId?: string }, handle: string): Promise<Album & SpaceFields> => {
      const albumPhotoIds = allPhotosRef.current
        .filter((p) => p.albumId === album.id)
        .map((p) => p.id);

      const { parent: newAlbum } = await shareTree(db, spaces, {
        collection: albums,
        id: album.id,
        invitee: handle,
        spaceName: album.name,
        children: {
          collection: photos,
          ids: albumPhotoIds,
          overrides: (newParent) => ({ albumId: (newParent as Album).id }),
        },
      });
      return newAlbum as Album & SpaceFields;
    },
    [db, spaces],
  );

  const inviteToAlbum = useCallback(
    async (album: Album & { _spaceId?: string }, handle: string) => {
      if (!album._spaceId) throw new Error("Cannot invite to a personal album");

      await spaces.invite(album._spaceId, handle, { spaceName: album.name });
    },
    [spaces],
  );

  /** Add a photo record in the correct space for the given album. */
  const addPhoto = useCallback(
    async (
      data: {
        albumId: string;
        filename: string;
        mimeType: string;
        size: number;
        width: number;
        height: number;
        fileId: string;
        thumbFileId?: string;
        caption: string;
      },
      album?: Album & { _spaceId?: string },
    ) => {
      const record = await db.put(photos, data, album ? spaceOf(album) : undefined);
      return record;
    },
    [db],
  );

  /** Delete a photo record. Caller is responsible for evicting the file. */
  const deletePhoto = useCallback(
    async (id: string) => {
      await db.delete(photos, id);
    },
    [db],
  );

  return {
    albums: allAlbums,
    photos: allPhotos,
    invitations: invitations.records,
    createAlbum,
    deleteAlbum,
    shareAlbum,
    inviteToAlbum,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
    addPhoto,
    deletePhoto,
  };
}

// Re-export Photo type for consumers
export type { Photo };
