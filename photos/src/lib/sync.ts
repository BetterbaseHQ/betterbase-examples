/**
 * useAlbums — domain-specific sync hook for the Photos app.
 *
 * Wraps useSpaces() sharing primitives with the albums + photos collections to
 * provide a unified API for album management + sharing. Child photos are
 * migrated to the shared space on share via bulkMoveToSpace, with the
 * albumId FK updated to point to the new album ID.
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
import { moveToSpace, bulkMoveToSpace, spaceOf, type SpaceFields } from "betterbase/sync";
import { albums, photos, type Album, type Photo } from "@/lib/db";

export function useAlbums() {
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

  const albumResult = useQuery(albums, {
    sort: [{ field: "sortOrder", direction: "asc" }],
  });
  const allAlbums = albumResult.records;

  const photoResult = useQuery(photos, {
    sort: [{ field: "createdAt", direction: "desc" }],
  });
  const allPhotos = photoResult.records;

  const invitations = usePendingInvitations();

  // Keep a ref to allPhotos to avoid stale closure in shareAlbum/deleteAlbum
  const allPhotosRef = useRef(allPhotos);
  allPhotosRef.current = allPhotos;

  const createAlbum = useCallback(
    async (name: string) => {
      const maxOrder = allAlbums.reduce((max, a) => Math.max(max, a.sortOrder), 0);
      // @ts-expect-error TS2589: type depth limit
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
   * Share a personal album with another user.
   * Creates a new shared space, moves the album to it, migrates all child
   * photos (with updated albumId FK), and invites the user.
   */
  const shareAlbum = useCallback(
    async (album: Album & SpaceFields, handle: string): Promise<Album & SpaceFields> => {
      const exists = await userExists(handle);
      if (!exists) throw new Error(`User "${handle}" not found`);

      const spaceId = await createSpace();
      const newAlbum = await moveToSpace(db, albums, album.id, spaceId);

      const albumPhotoIds = allPhotosRef.current
        .filter((p) => p.albumId === album.id)
        .map((p) => p.id);
      await bulkMoveToSpace(db, photos, albumPhotoIds, spaceId, {
        albumId: newAlbum.id,
      });

      await invite(spaceId, handle, { spaceName: album.name });
      return newAlbum;
    },
    [db, userExists, createSpace, invite],
  );

  const inviteToAlbum = useCallback(
    async (album: Album & SpaceFields, handle: string) => {
      if (!album._spaceId) throw new Error("Cannot invite to a personal album");

      await invite(album._spaceId, handle, { spaceName: album.name });
    },
    [invite],
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
        caption: string;
      },
      album?: Album & SpaceFields,
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
