/**
 * useAlbums — domain-specific sync hook for the Photos app.
 *
 * Wraps useSpaces() sharing primitives with the albums + photos collections to
 * provide a unified API for album management + sharing. Child photos are
 * migrated to the shared space on share via shareTree, with the albumId FK
 * updated to point to the new album ID. Cached photo BLOBS migrate too —
 * shareAlbum re-keys them into the shared space and re-queues their uploads
 * (records without bytes would render "Unavailable" tiles for the invitee).
 *
 * Local mutations auto-sync via SyncEngine's db.onChange listener — no manual
 * scheduleSync() calls needed.
 *
 * Must be called inside BetterbaseProvider (authenticated path only).
 */

import { useRef, useCallback } from "react";
import { useSyncDb, useSpaces, usePendingInvitations, useQuery } from "betterbase/sync/react";
import { shareTree, spaceOf, type FileStore, type SpaceFields } from "betterbase/sync";
import { albums, photos, type Album, type Photo } from "@/lib/db";

export function useAlbums(fileStore?: FileStore) {
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

  // Keep a ref to allPhotos to avoid stale closure in shareAlbum
  const allPhotosRef = useRef(allPhotos);
  allPhotosRef.current = allPhotos;

  const createAlbum = useCallback(
    async (name: string) => {
      const maxOrder = allAlbums.reduce((max, a) => Math.max(max, a.sortOrder), 0);
      await db.put(albums, { name, sortOrder: maxOrder + 1 });
    },
    [db, allAlbums],
  );

  /**
   * Share a personal album with another user. shareTree creates a new shared
   * space, moves the album to it, migrates all child photos (with the albumId
   * FK rewritten to the album's new ID), and invites the user. Returns the
   * new album record (with a new ID in the shared space).
   *
   * The photo BLOBS follow the records: each cached file is re-keyed into
   * the shared space and re-queued, so it re-uploads under the space's
   * epoch key and the invitee can actually download it (records without
   * bytes would render "Unavailable" tiles).
   */
  const shareAlbum = useCallback(
    async (album: Album & { _spaceId?: string }, handle: string): Promise<Album & SpaceFields> => {
      const albumPhotoIds = allPhotosRef.current
        .filter((p) => p.albumId === album.id)
        .map((p) => p.id);

      const { parent: newAlbum, spaceId } = await shareTree(db, spaces, {
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

      if (fileStore) {
        // Records moved — re-read them in the shared space for their new
        // IDs (moves assign fresh ones; fileIds are stable field values).
        // The share already succeeded: a migration failure must not reject
        // the whole call (records are the source of truth; blobs are
        // re-uploadable), so contain it and surface a warning instead.
        try {
          const moved = (await db.query(photos, { filter: { albumId: newAlbum.id } })).records;
          // Both the full blob and the thumbnail upload against the photo's
          // record — the server validates X-Record-ID against the space.
          const recordIdOf = new Map<string, string>();
          for (const p of moved) {
            recordIdOf.set(p.fileId, p.id);
            if (p.thumbFileId) recordIdOf.set(p.thumbFileId, p.id);
          }
          const fileIds = moved.flatMap((p) => {
            const ids = [p.fileId];
            if (p.thumbFileId) ids.push(p.thumbFileId);
            return ids;
          });
          const { skipped, failed } = await fileStore.migrateFilesToSpace(fileIds, spaceId, {
            recordIdOf: (fid) => recordIdOf.get(fid),
          });
          if (skipped > 0 || failed > 0) {
            console.warn(
              `shareAlbum: ${skipped} file(s) skipped, ${failed} failed migration — ` +
                `they will show "Unavailable" for the invitee until re-uploaded`,
            );
          }
        } catch (err) {
          // Migration failures never reject the share: the records are the
          // source of truth and the invitation already went out. Affected
          // photos render "Unavailable" until re-added; retryable
          // failures heal on a re-attempted migration.
          console.warn("shareAlbum: blob migration failed — records shared without bytes", err);
        }
      }

      return newAlbum as Album & SpaceFields;
    },
    [db, spaces, fileStore],
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
