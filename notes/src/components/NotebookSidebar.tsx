import { useState } from "react";
import { Stack, NavLink, ActionIcon, Group, Text, Box } from "@mantine/core";
import { FileText, Star, Book, Plus, Trash2, Users } from "lucide-react";
import { ConfirmDialog, InlineTextInput } from "@betterbase/examples-shared";
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
  const [pendingDelete, setPendingDelete] = useState<(Notebook & { _spaceId?: string }) | null>(
    null,
  );

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
        <ActionIcon
          size="xs"
          variant="subtle"
          aria-label="New notebook"
          onClick={() => setCreating(true)}
        >
          <Plus size={14} />
        </ActionIcon>
      </Group>

      {creating && (
        <Box mx="xs" mb={4}>
          <InlineTextInput
            placeholder="Notebook name"
            ariaLabel="New notebook name"
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
                  aria-label={`Delete notebook ${nb.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(nb);
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

      <ConfirmDialog
        opened={pendingDelete != null}
        title="Delete notebook"
        message={
          pendingDeleteIsShared ? (
            <>
              Delete <b>{pendingDelete?.name}</b> and all its notes? It is shared — this deletes it
              for everyone and cannot be undone.
            </>
          ) : (
            <>
              Delete <b>{pendingDelete?.name}</b> and all its notes? This cannot be undone.
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
