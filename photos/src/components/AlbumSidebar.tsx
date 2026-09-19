import { Stack, NavLink, Text } from "@mantine/core";
import { Image, FolderOpen } from "lucide-react";
import { ItemsSidebar } from "@betterbase/examples-shared";
import type { Album } from "@/lib/db";
import type { View } from "@/App";

interface AlbumSidebarProps {
  albums: readonly (Album & { _spaceId?: string })[];
  personalSpaceId?: string | null;
  view: View;
  onViewChange: (view: View) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  counts: {
    all: number;
    byAlbum: Record<string, number>;
  };
}

/** "All Photos" entry plus the shared generic album list. */
export function AlbumSidebar({
  albums,
  personalSpaceId,
  view,
  onViewChange,
  onCreate,
  onDelete,
  counts,
}: AlbumSidebarProps) {
  return (
    <Stack gap={0} p="xs" h="100%">
      <NavLink
        label="All Photos"
        leftSection={<Image size={16} />}
        rightSection={
          <Text size="xs" c="dimmed">
            {counts.all}
          </Text>
        }
        active={view.kind === "all"}
        onClick={() => onViewChange({ kind: "all" })}
      />

      <ItemsSidebar
        label="Albums"
        noun="album"
        childNoun="photos"
        items={albums}
        personalSpaceId={personalSpaceId}
        selectedId={view.kind === "album" ? view.id : null}
        onSelect={(id) => onViewChange({ kind: "album", id })}
        onCreate={onCreate}
        onDelete={onDelete}
        createPlaceholder="New album..."
        getItemIcon={() => <FolderOpen size={16} />}
        getItemCount={(album) => counts.byAlbum[album.id] ?? 0}
      />
    </Stack>
  );
}
