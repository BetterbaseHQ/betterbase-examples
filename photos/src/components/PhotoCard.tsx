import { useState } from "react";
import { ActionIcon, Skeleton, Tooltip } from "@mantine/core";
import { Trash2 } from "lucide-react";
import { useFile } from "betterbase/sync/react";
import { ConfirmDialog } from "@betterbase/examples-shared";
import type { Photo } from "@/lib/db";

interface PhotoCardProps {
  photo: Photo;
  /** Computed dimensions from react-photo-album layout engine. */
  style?: { width: number; height: number };
  onDelete: (photo: Photo) => void;
  onClick: () => void;
}

export function PhotoCard({ photo, style, onDelete, onClick }: PhotoCardProps) {
  // Grid renders the thumbnail when available; the lightbox uses the full blob
  const { url, status } = useFile(photo.thumbFileId ?? photo.fileId, photo.mimeType);
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dimensions = style ?? {
    width: photo.width,
    height: photo.height,
  };

  if (status === "loading" || status === "idle") {
    return (
      <Skeleton
        style={{
          width: dimensions.width,
          height: dimensions.height,
          borderRadius: 8,
        }}
      />
    );
  }

  if (!url) {
    return (
      <div
        style={{
          width: dimensions.width,
          height: dimensions.height,
          borderRadius: 8,
          backgroundColor: "var(--mantine-color-gray-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--mantine-color-dimmed)",
          fontSize: 12,
        }}
      >
        Unavailable
      </div>
    );
  }

  return (
    // div, not button: the hover overlay contains a nested delete button, and
    // interactive elements can't nest in HTML
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`Open ${photo.filename}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: 8,
        overflow: "hidden",
        width: dimensions.width,
        height: dimensions.height,
        cursor: "pointer",
      }}
    >
      <img
        src={url}
        alt={photo.filename}
        loading="lazy"
        decoding="async"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
      {hovered && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(transparent 60%, rgba(0,0,0,0.5))",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            padding: 8,
          }}
        >
          <span
            style={{
              color: "white",
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
          >
            {photo.filename}
          </span>
          <Tooltip label="Delete">
            <ActionIcon
              size="sm"
              variant="filled"
              color="red"
              aria-label={`Delete ${photo.filename}`}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
            >
              <Trash2 size={12} />
            </ActionIcon>
          </Tooltip>
        </div>
      )}
      <ConfirmDialog
        opened={confirmDelete}
        title="Delete photo"
        message={`Delete ${photo.filename}? This cannot be undone.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete(photo);
        }}
      />
    </div>
  );
}
