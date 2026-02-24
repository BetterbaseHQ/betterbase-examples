import { useState } from "react";
import { ActionIcon, Skeleton, Tooltip } from "@mantine/core";
import { Trash2 } from "lucide-react";
import { useFile } from "betterbase/sync/react";
import type { Photo } from "@/lib/db";

interface PhotoCardProps {
  photo: Photo;
  /** Computed dimensions from react-photo-album layout engine. */
  style?: { width: number; height: number };
  onDelete: (photo: Photo) => void;
  onClick: () => void;
}

export function PhotoCard({ photo, style, onDelete, onClick }: PhotoCardProps) {
  const { url, status } = useFile(photo.fileId, photo.mimeType);
  const [hovered, setHovered] = useState(false);

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
    <div
      style={{
        position: "relative",
        cursor: "pointer",
        borderRadius: 8,
        overflow: "hidden",
        width: dimensions.width,
        height: dimensions.height,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <img
        src={url}
        alt={photo.filename}
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
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm("Delete this photo?")) {
                  onDelete(photo);
                }
              }}
            >
              <Trash2 size={12} />
            </ActionIcon>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
