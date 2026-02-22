import { useState } from "react";
import { Stack, NavLink, TextInput, ActionIcon, Group, Text } from "@mantine/core";
import { FileText, Star, Book, Plus, Trash2, Users } from "lucide-react";
import type { Notebook } from "@/lib/db";

type View = { kind: "all" } | { kind: "favorites" } | { kind: "notebook"; id: string };

interface NotebookSidebarProps {
  notebooks: readonly (Notebook & { _spaceId?: string })[];
  personalSpaceId?: string | null;
  view: View;
  onViewChange: (view: View) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  counts: {
    all: number;
    favorites: number;
    byNotebook: Record<string, number>;
  };
}

export function NotebookSidebar({
  notebooks,
  personalSpaceId,
  view,
  onViewChange,
  onCreate,
  onDelete,
  counts,
}: NotebookSidebarProps) {
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
        label="All Notes"
        leftSection={<FileText size={16} />}
        rightSection={
          <Text size="xs" c="dimmed">
            {counts.all}
          </Text>
        }
        active={view.kind === "all"}
        onClick={() => onViewChange({ kind: "all" })}
      />
      <NavLink
        label="Favorites"
        leftSection={<Star size={16} />}
        rightSection={
          <Text size="xs" c="dimmed">
            {counts.favorites}
          </Text>
        }
        active={view.kind === "favorites"}
        onClick={() => onViewChange({ kind: "favorites" })}
      />

      <Group justify="space-between" mt="md" mb={4} px="sm">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Notebooks
        </Text>
        <ActionIcon size="xs" variant="subtle" onClick={() => setCreating(true)}>
          <Plus size={14} />
        </ActionIcon>
      </Group>

      {creating && (
        <TextInput
          size="xs"
          placeholder="Notebook name"
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

      {notebooks.map((nb) => {
        const isShared = nb._spaceId != null && nb._spaceId !== personalSpaceId;
        return (
          <NavLink
            key={nb.id}
            label={nb.name}
            leftSection={<Book size={16} />}
            rightSection={
              <Group gap={4} wrap="nowrap">
                {isShared && <Users size={12} color="var(--mantine-color-blue-5)" />}
                <Text size="xs" c="dimmed">
                  {counts.byNotebook[nb.id] ?? 0}
                </Text>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete "${nb.name}" and all its notes?`)) {
                      onDelete(nb.id);
                    }
                  }}
                >
                  <Trash2 size={12} />
                </ActionIcon>
              </Group>
            }
            active={view.kind === "notebook" && view.id === nb.id}
            onClick={() => onViewChange({ kind: "notebook", id: nb.id })}
          />
        );
      })}
    </Stack>
  );
}
