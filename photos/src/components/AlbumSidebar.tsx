import { useState } from "react";
import { Stack, NavLink, TextInput, ActionIcon, Group, Text } from "@mantine/core";
import { Image, FolderOpen, Plus, Trash2, Users } from "lucide-react";
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

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
    setCreating(false);
  };

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
        <ActionIcon size="xs" variant="subtle" onClick={() => setCreating(true)}>
          <Plus size={14} />
        </ActionIcon>
      </Group>

      {creating && (
        <TextInput
          size="xs"
          placeholder="Album name"
          value={newName}
          onChange={(e) => setNewName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
            if (e.key === "Escape") {
              setCreating(false);
              setNewName("");
            }
          }}
          onBlur={() => {
            if (newName.trim()) handleCreate();
            else {
              setCreating(false);
              setNewName("");
            }
          }}
          mx="xs"
          mb={4}
          autoFocus
        />
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
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete "${album.name}" and all its photos?`)) {
                      onDelete(album.id);
                    }
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
    </Stack>
  );
}
