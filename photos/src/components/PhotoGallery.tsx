import { useState, useCallback } from "react";
import { Group, Text, ActionIcon, Button } from "@mantine/core";
import { Dropzone, IMAGE_MIME_TYPE } from "@mantine/dropzone";
import { Upload, ImagePlus } from "lucide-react";
import { RowsPhotoAlbum } from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import { EmptyState, ShareButton, MembersPanel } from "@betterbase/examples-shared";
import type { Photo, Album } from "@/lib/db";
import { PhotoCard } from "@/components/PhotoCard";
import { LightboxSlide } from "@/components/LightboxSlide";

import "react-photo-album/rows.css";
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
}: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [uploading, setUploading] = useState(false);

  const handleDrop = useCallback(
    async (files: File[]) => {
      setUploading(true);
      try {
        await onUpload(files);
      } finally {
        setUploading(false);
      }
    },
    [onUpload],
  );

  const isPersonal = album == null || album._spaceId == null || album._spaceId === personalSpaceId;
  const isShared = album != null && album._spaceId != null && !isPersonal;

  // Map photos to react-photo-album format.
  // src is a placeholder — PhotoCard handles actual image loading via render.photo.
  const albumPhotos = photos.map((p) => ({
    src: "",
    width: p.width,
    height: p.height,
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
            {isShared && album._spaceId && onInvite && onRemoveMember && (
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
          {isShared && album!._spaceId && onInvite && onRemoveMember && (
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
          <ActionIcon variant="light" size="md">
            <ImagePlus size={16} />
          </ActionIcon>
        </Dropzone>
      </Group>

      {/* Photo grid */}
      <RowsPhotoAlbum
        photos={albumPhotos}
        targetRowHeight={200}
        spacing={8}
        rowConstraints={{ maxPhotos: 5 }}
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
            const photo = photos.find((p) => p.fileId === slide.src);
            if (!photo) return null;
            return <LightboxSlide photo={photo} />;
          },
        }}
      />
    </div>
  );
}
