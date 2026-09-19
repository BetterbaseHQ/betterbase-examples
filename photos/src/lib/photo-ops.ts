/**
 * Photo operations shared by the local and synced paths.
 *
 * Both App paths run identical upload/delete sequences — they differ only in
 * how a photo record is created (plain local put vs the sync hook's
 * space-aware put). The `addPhoto` injection covers that one difference.
 */

import { useCallback } from "react";
import { FileStore } from "betterbase/sync";
import { albums, photos, type Album, type Photo } from "@/lib/db";
import { generateThumbnail } from "@/lib/thumbnail";
import { reportError } from "@betterbase/examples-shared";

/** Fields both paths set when creating a photo record (before the thumbnail exists). */
export interface PhotoUploadData {
  albumId: string;
  filename: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  fileId: string;
  caption: string;
}

/** Structural slice of the database the photo ops need (local db or sync adapter). */
interface PhotoDb {
  get(collection: typeof photos, id: string): Promise<unknown>;
  patch(collection: typeof photos, patch: { id: string; thumbFileId: string }): Promise<unknown>;
  delete(collection: typeof photos, id: string): Promise<unknown>;
  delete(collection: typeof albums, id: string): Promise<unknown>;
  put(collection: typeof photos, data: PhotoUploadData): Promise<{ id: string }>;
}

/** Creates a photo record — plain put locally, space-aware put when synced. */
export type AddPhoto = (
  data: PhotoUploadData,
  album?: Album & { _spaceId?: string },
) => Promise<{ id: string }>;

/** All FileStore ids backing a photo record (full blob + thumbnail). */
export function photoFileIds(photo: Photo): string[] {
  return photo.thumbFileId ? [photo.fileId, photo.thumbFileId] : [photo.fileId];
}

/** Read image dimensions by loading into an Image element. */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

/**
 * Upload one photo: full blob + grid thumbnail (best-effort — a thumbnail
 * failure downgrades to rendering the full image, never fails the upload).
 */
export async function putPhotoFiles(
  db: PhotoDb,
  fileStore: FileStore,
  recordId: string,
  file: File,
  fileId: string,
): Promise<string | undefined> {
  await fileStore.put(fileId, new Uint8Array(await file.arrayBuffer()), recordId);
  try {
    const thumb = await generateThumbnail(file);
    // The photo may have been deleted while the full blob was uploading —
    // skip the thumbnail quietly instead of failing the whole upload
    const record = await db.get(photos, recordId);
    if (!record) return undefined;
    const thumbFileId = crypto.randomUUID();
    await fileStore.put(thumbFileId, thumb, recordId);
    return thumbFileId;
  } catch (err) {
    console.warn("Thumbnail generation failed", err);
    return undefined;
  }
}

/**
 * Upload files one at a time; a bad file skips to the next instead of aborting
 * the batch. Returns the filenames that failed.
 */
async function uploadOneByOne(
  files: File[],
  addOne: (file: File) => Promise<void>,
): Promise<string[]> {
  const failed: string[] = [];
  for (const file of files) {
    try {
      await addOne(file);
    } catch (err) {
      console.error(`Upload failed for ${file.name}`, err);
      failed.push(file.name);
    }
  }
  return failed;
}

function reportFailedUploads(failed: string[], total: number): void {
  if (failed.length === 0) return;
  reportError(
    new Error(
      failed.length === total
        ? "Upload failed"
        : `${failed.length} of ${total} photos failed to upload`,
    ),
    failed.length === total ? "Upload failed" : "Some photos failed to upload",
  );
}

/** Sidebar counts: total photos plus per-album breakdown. */
export function computePhotoCounts(
  allAlbums: readonly { id: string }[],
  allPhotos: readonly { albumId: string }[],
): { all: number; byAlbum: Record<string, number> } {
  return {
    all: allPhotos.length,
    byAlbum: Object.fromEntries(
      allAlbums.map((a) => [a.id, allPhotos.filter((p) => p.albumId === a.id).length]),
    ),
  };
}

/**
 * Upload/delete flows used by both the local and synced app paths. Errors are
 * caught and reported here so callers can wire these straight into props.
 */
export function usePhotoOps(db: PhotoDb, fileStore: FileStore, addPhoto?: AddPhoto) {
  const add = addPhoto ?? ((data: PhotoUploadData) => db.put(photos, data));

  /** Upload files into an album ("" = All Photos). Synced callers pass the album for space routing. */
  const upload = useCallback(
    async (files: File[], albumId: string, album?: Album & { _spaceId?: string }) => {
      const failed = await uploadOneByOne(files, async (file) => {
        const fileId = crypto.randomUUID();
        const { width, height } = await getImageDimensions(file);
        const record = await add(
          {
            albumId,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            width,
            height,
            fileId,
            caption: "",
          },
          album,
        );
        const thumbFileId = await putPhotoFiles(db, fileStore, record.id, file, fileId);
        if (thumbFileId) await db.patch(photos, { id: record.id, thumbFileId });
      });
      reportFailedUploads(failed, files.length);
    },
    [db, fileStore, add],
  );

  // NOTE: deleting a photo removes the record and the local file cache, but the
  // sync service keeps the encrypted blob (the SDK's FileStore has no remote
  // delete yet). Orphaned blobs are invisible but consume server storage.
  const deletePhoto = useCallback(
    (photo: Photo) => {
      db.delete(photos, photo.id)
        .then(() => photoFileIds(photo).forEach((fid) => fileStore.evict(fid)))
        .catch((err) => reportError(err, "Couldn't delete photo"));
    },
    [db, fileStore],
  );

  /**
   * Delete an album and its photo records (`albumPhotos` = photos whose
   * albumId is the album), evicting cached files. `onDeleted` runs only on
   * success — used by callers to reset the selected view.
   */
  const deleteAlbum = useCallback(
    (id: string, albumPhotos: readonly Photo[], onDeleted?: () => void) => {
      Promise.all(albumPhotos.map((p) => db.delete(photos, p.id)))
        .then(() => db.delete(albums, id))
        .then(() => fileStore.evictAll(albumPhotos.flatMap(photoFileIds)))
        .then(() => onDeleted?.())
        .catch((err) => reportError(err, "Couldn't delete album"));
    },
    [db, fileStore],
  );

  return { upload, deletePhoto, deleteAlbum };
}
