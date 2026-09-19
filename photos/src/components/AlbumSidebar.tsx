import { useState } from "react";
import { Stack, NavLink, ActionIcon, Group, Text, Box } from "@mantine/core";
import { Image, FolderOpen, Plus, Trash2, Users } from "lucide-react";
import { ConfirmDialog, InlineTextInput } from "@betterbase/examples-shared";
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

export function AlbumSidebar({
  albums,
  personalSpaceId,
  view,
  onViewChange,
  onCreate,
  onDelete,
  counts,
}: AlbumSidebarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<(Album & { _spaceId?: string }) | null>(null);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
    setCreating(false);
  };

  const pendingDeleteIsShared =
    pendingDelete != null &&
    pendingDelete._spaceId != null &&
    pendingDelete._spaceId !== personalSpaceId;

  return (
    <Stack gap={0} p="xs">
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

      <Group justify="space-between" mt="md" mb={4} px="sm">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Albums
        </Text>
        <ActionIcon
          size="xs"
          variant="subtle"
          aria-label="New album"
          onClick={() => setCreating(true)}
        >
          <Plus size={14} />
        </ActionIcon>
      </Group>

      {creating && (
        <Box mx="xs" mb={4}>
          <InlineTextInput
            placeholder="Album name"
            ariaLabel="New album name"
            value={newName}
            onChange={setNewName}
            onSubmit={handleCreate}
            onCancel={() => {
              setCreating(false);
              setNewName("");
            }}
          />
        </Box>
      )}

      {albums.map((album) => {
        const isShared = album._spaceId != null && album._spaceId !== personalSpaceId;
        return (
          <NavLink
            key={album.id}
            label={album.name}
            leftSection={<FolderOpen size={16} />}
            rightSection={
              <Group gap={4} wrap="nowrap">
                {isShared && <Users size={12} color="var(--mantine-color-blue-5)" />}
                <Text size="xs" c="dimmed">
                  {counts.byAlbum[album.id] ?? 0}
                </Text>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  aria-label={`Delete album ${album.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(album);
                  }}
                >
                  <Trash2 size={12} />
                </ActionIcon>
              </Group>
            }
            active={view.kind === "album" && view.id === album.id}
            onClick={() => onViewChange({ kind: "album", id: album.id })}
          />
        );
      })}

      <ConfirmDialog
        opened={pendingDelete != null}
        title="Delete album"
        message={
          pendingDeleteIsShared ? (
            <>
              Delete <b>{pendingDelete?.name}</b> and all its photos? It is shared — this deletes it
              for everyone and cannot be undone.
            </>
          ) : (
            <>
              Delete <b>{pendingDelete?.name}</b> and all its photos? This cannot be undone.
            </>
          )
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </Stack>
  );
}
