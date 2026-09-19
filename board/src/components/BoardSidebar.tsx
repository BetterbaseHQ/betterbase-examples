import { useState } from "react";
import { Stack, NavLink, TextInput, ActionIcon, Group, Text } from "@mantine/core";
import { LayoutDashboard, Plus, Trash2, Users } from "lucide-react";
import { ConfirmDialog } from "@betterbase/examples-shared";
import type { Board } from "@/lib/db";

interface BoardSidebarProps {
  boards: readonly (Board & { _spaceId?: string })[];
  personalSpaceId?: string | null;
  selectedBoardId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  cardCounts: Record<string, number>;
}

export function BoardSidebar({
  boards,
  personalSpaceId,
  selectedBoardId,
  onSelect,
  onCreate,
  onDelete,
  cardCounts,
}: BoardSidebarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<(Board & { _spaceId?: string }) | null>(null);

  const pendingDeleteIsShared =
    pendingDelete != null &&
    pendingDelete._spaceId != null &&
    pendingDelete._spaceId !== personalSpaceId;

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
    setCreating(false);
  };

  return (
    <Stack gap={0} p={4}>
      <Group justify="space-between" mb={2} px={8}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Boards
        </Text>
        <ActionIcon
          size="xs"
          variant="subtle"
          aria-label="New board"
          onClick={() => setCreating(true)}
        >
          <Plus size={14} />
        </ActionIcon>
      </Group>

      {creating && (
        <TextInput
          size="xs"
          placeholder="Board name"
          aria-label="New board name"
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
          mx={4}
          mb={2}
          autoFocus
        />
      )}

      {boards.map((board) => {
        const isShared = board._spaceId != null && board._spaceId !== personalSpaceId;
        return (
          <NavLink
            key={board.id}
            label={board.name}
            leftSection={<LayoutDashboard size={14} />}
            rightSection={
              <Group gap={4} wrap="nowrap">
                {isShared && <Users size={12} color="var(--mantine-color-blue-5)" />}
                <Text size="xs" c="dimmed">
                  {cardCounts[board.id] ?? 0}
                </Text>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  aria-label={`Delete board ${board.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(board);
                  }}
                >
                  <Trash2 size={12} />
                </ActionIcon>
              </Group>
            }
            active={selectedBoardId === board.id}
            onClick={() => onSelect(board.id)}
            py={4}
            px={8}
            fz="sm"
            styles={{ label: { fontSize: "var(--mantine-font-size-sm)" } }}
          />
        );
      })}
      <ConfirmDialog
        opened={pendingDelete != null}
        title="Delete board"
        message={
          pendingDeleteIsShared ? (
            <>
              Delete <b>{pendingDelete?.name}</b> and all its cards? It is shared — this deletes it
              for everyone and cannot be undone.
            </>
          ) : (
            <>
              Delete <b>{pendingDelete?.name}</b> and all its cards? This cannot be undone.
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
