import { useState, useCallback, useMemo } from "react";
import { Group, Text, ActionIcon, Button } from "@mantine/core";
import { Dropzone, IMAGE_MIME_TYPE } from "@mantine/dropzone";
import { Upload, ImagePlus } from "lucide-react";
import { ColumnsPhotoAlbum } from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import {
  EmptyState,
  ShareButton,
  MembersPanel,
  RemovedSpaceNotice,
  reportError,
  noRemovedSpaces,
  type RemovedSpaceProbe,
} from "@betterbase/examples-shared";
import { isShared } from "betterbase/sync";
import type { Photo, Album } from "@/lib/db";
import { PhotoCard } from "@/components/PhotoCard";
import { LightboxSlide } from "@/components/LightboxSlide";

import "react-photo-album/columns.css";
import "yet-another-react-lightbox/styles.css";

interface PhotoGalleryProps {
  photos: readonly Photo[];
  onUpload: (files: File[]) => Promise<void>;
  onDelete: (photo: Photo) => void;
  // Sharing props — only provided in the synced path when an album is selected
  album?: (Album & { _spaceId?: string }) | null;
  personalSpaceId?: string | null;
  isAdmin?: boolean;
  onShare?: (handle: string) => Promise<void>;
  onInvite?: (handle: string) => Promise<void>;
  onRemoveMember?: (did: string) => Promise<void>;
  /** Reactive removed-space probe injected by the synced path (local path stays inert). */
  useRemovedSpace?: RemovedSpaceProbe;
  /** Local cleanup for the victim's copy — must evict cached blobs too. */
  onDeleteLocalCopy?: () => void | Promise<void>;
}

export function PhotoGallery({
  photos,
  onUpload,
  onDelete,
  album,
  personalSpaceId,
  isAdmin = false,
  onShare,
  onInvite,
  onRemoveMember,
  useRemovedSpace = noRemovedSpaces,
  onDeleteLocalCopy,
}: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [uploading, setUploading] = useState(false);
  const [deletingLocalCopy, setDeletingLocalCopy] = useState(false);

  const handleDrop = useCallback(
    async (files: File[]) => {
      setUploading(true);
      try {
        await onUpload(files);
      } catch (err) {
        reportError(err, "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [onUpload],
  );

  const photoByFileId = useMemo(() => new Map(photos.map((p) => [p.fileId, p])), [photos]);

  const isSharedAlbum = album != null && isShared(album, personalSpaceId);
  const isPersonal = !isSharedAlbum;

  // Called as a hook every render (stable identity per app path) — the `use`
  // prefix keeps eslint's rules-of-hooks enforcing the unconditional call.
  const removedSpace = useRemovedSpace(album?._spaceId ?? null);

  // Victim of a removal: freeze the album — grid, dropzone, and lightbox are
  // replaced by the re-key notice. The delete action removes records AND the
  // locally cached blobs (an album delete evicts every file it references).
  if (removedSpace.removed && album) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Group justify="space-between" px="md" py={8}>
          <Text fw={600}>{album.name}</Text>
        </Group>
        <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "md" }}>
          <RemovedSpaceNotice
            kindLabel="album"
            name={removedSpace.name}
            deleting={deletingLocalCopy}
            onDeleteLocalCopy={
              onDeleteLocalCopy
                ? () => {
                    setDeletingLocalCopy(true);
                    Promise.resolve(onDeleteLocalCopy())
                      .catch((err) => reportError(err, "Couldn't delete local copy"))
                      .finally(() => setDeletingLocalCopy(false));
                  }
                : undefined
            }
          />
        </div>
      </div>
    );
  }

  // Map photos to react-photo-album format.
  // src is a placeholder — PhotoCard handles actual image loading via render.photo.
  // Dimensions fall back to a square and are floored at 1: layout math
  // divides by aspect ratio, and missing/zero metadata (side-car-less
  // imports) would otherwise produce NaN or unbounded tiles.
  const albumPhotos = photos.map((p) => ({
    src: "",
    width: Math.max(p.width ?? 1, 1),
    height: Math.max(p.height ?? 1, 1),
    key: p.id,
  }));

  if (photos.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Sharing header when an album is selected */}
        {album && (isPersonal ? onShare : onInvite) && (
          <Group
            justify="space-between"
            px="md"
            py={8}
            style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}
          >
            <Text fw={600}>{album.name}</Text>
            {isPersonal && onShare && <ShareButton onShare={onShare} />}
            {isSharedAlbum && album._spaceId && onInvite && onRemoveMember && (
              <MembersPanel
                spaceId={album._spaceId}
                isAdmin={isAdmin}
                onInvite={onInvite}
                onRemoveMember={onRemoveMember}
              />
            )}
          </Group>
        )}
        <Dropzone
          onDrop={handleDrop}
          accept={IMAGE_MIME_TYPE}
          loading={uploading}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "var(--mantine-spacing-md)",
            border: "2px dashed var(--mantine-color-gray-4)",
            borderRadius: "var(--mantine-radius-md)",
            cursor: "pointer",
          }}
        >
          <EmptyState
            icon={<Upload size={32} />}
            title="Drop photos here"
            description="or click to browse"
            action={
              <Button
                variant="light"
                size="sm"
                leftSection={<ImagePlus size={16} />}
                onClick={(e) => e.stopPropagation()}
              >
                Upload Photos
              </Button>
            }
          />
        </Dropzone>
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--mantine-spacing-md)" }}>
      {/* Header with photo count, sharing controls, and upload button */}
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <Text size="sm" c="dimmed">
            {photos.length} {photos.length === 1 ? "photo" : "photos"}
          </Text>
          {isPersonal && onShare && <ShareButton onShare={onShare} />}
          {isSharedAlbum && album!._spaceId && onInvite && onRemoveMember && (
            <MembersPanel
              spaceId={album!._spaceId}
              isAdmin={isAdmin}
              onInvite={onInvite}
              onRemoveMember={onRemoveMember}
            />
          )}
        </Group>
        <Dropzone
          onDrop={handleDrop}
          accept={IMAGE_MIME_TYPE}
          loading={uploading}
          styles={{
            root: {
              border: "none",
              padding: 0,
              backgroundColor: "transparent",
              minHeight: "unset",
            },
          }}
        >
          <ActionIcon variant="light" size="md" aria-label="Upload photos">
            <ImagePlus size={16} />
          </ActionIcon>
        </Dropzone>
      </Group>

      {/* Photo grid — fixed columns (not rows): a degenerate aspect ratio
          (missing metadata, 1×1 imports) can't stretch a row to fill the
          container width, so every tile stays bounded and uniform. */}
      <ColumnsPhotoAlbum
        photos={albumPhotos}
        columns={3}
        spacing={8}
        render={{
          photo: (_, { index, width, height }) => (
            <PhotoCard
              key={photos[index]!.id}
              photo={photos[index]!}
              style={{ width, height }}
              onDelete={onDelete}
              onClick={() => setLightboxIndex(index)}
            />
          ),
        }}
      />

      {/* Lightbox */}
      <Lightbox
        open={lightboxIndex >= 0}
        index={lightboxIndex}
        close={() => setLightboxIndex(-1)}
        slides={photos.map((p) => ({ src: p.fileId }))}
        render={{
          slide: ({ slide }) => {
            const photo = photoByFileId.get(slide.src);
            if (!photo) return null;
            return <LightboxSlide photo={photo} />;
          },
        }}
      />
    </div>
  );
}
