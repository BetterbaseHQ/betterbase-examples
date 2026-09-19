import { useState } from "react";
import { NavLink, TextInput, ActionIcon, Group, Stack, Text, ScrollArea } from "@mantine/core";
import { Plus, Trash2, Circle, Users } from "lucide-react";
import { ConfirmDialog } from "@betterbase/examples-shared";
import type { List } from "@/lib/db";

const LIST_COLORS = [
  "indigo",
  "blue",
  "teal",
  "green",
  "yellow",
  "orange",
  "red",
  "pink",
  "grape",
  "violet",
] as const;

type ListColor = (typeof LIST_COLORS)[number];

/** Colors arrive from peers via CRDT merge — never interpolate them into CSS unvalidated. */
function listColor(color: string): ListColor {
  return (LIST_COLORS as readonly string[]).includes(color) ? (color as ListColor) : "indigo";
}

type SidebarList = List & { _spaceId?: string };

interface TasksSidebarProps {
  lists: readonly SidebarList[];
  personalSpaceId?: string | null;
  selectedListId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string, color: string) => void;
  onDelete: (id: string) => void;
}

export function TasksSidebar({
  lists,
  personalSpaceId,
  selectedListId,
  onSelect,
  onCreate,
  onDelete,
}: TasksSidebarProps) {
  const [newListName, setNewListName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SidebarList | null>(null);

  const handleCreate = () => {
    const name = newListName.trim();
    if (!name) return;
    const color = LIST_COLORS[lists.length % LIST_COLORS.length]!;
    onCreate(name, color);
    setNewListName("");
  };

  const pendingDeleteIsShared =
    pendingDelete != null &&
    pendingDelete._spaceId != null &&
    pendingDelete._spaceId !== personalSpaceId;

  return (
    <Stack gap="xs" h="100%">
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="xs">
        Lists
      </Text>

      <ScrollArea flex={1}>
        <Stack gap={2}>
          {lists.map((list) => {
            const activeCount = list.todos.filter((t) => !t.completed).length;
            const isShared = list._spaceId != null && list._spaceId !== personalSpaceId;
            const color = listColor(list.color);
            return (
              <NavLink
                key={list.id}
                active={list.id === selectedListId}
                onClick={() => onSelect(list.id)}
                label={list.name}
                leftSection={
                  <Circle
                    size={10}
                    fill={`var(--mantine-color-${color}-6)`}
                    color={`var(--mantine-color-${color}-6)`}
                  />
                }
                rightSection={
                  <Group gap={4} wrap="nowrap">
                    {isShared && <Users size={12} color="var(--mantine-color-blue-5)" />}
                    {activeCount > 0 && (
                      <Text size="xs" c="dimmed">
                        {activeCount}
                      </Text>
                    )}
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      aria-label={`Delete list ${list.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(list);
                      }}
                    >
                      <Trash2 size={12} />
                    </ActionIcon>
                  </Group>
                }
              />
            );
          })}
        </Stack>
      </ScrollArea>

      <TextInput
        placeholder="New list..."
        aria-label="New list name"
        size="sm"
        value={newListName}
        onChange={(e) => setNewListName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleCreate();
        }}
        rightSection={
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label="Create list"
            onClick={handleCreate}
            disabled={!newListName.trim()}
          >
            <Plus size={16} />
          </ActionIcon>
        }
      />

      <ConfirmDialog
        opened={pendingDelete != null}
        title="Delete list"
        message={
          pendingDeleteIsShared ? (
            <>
              Delete <b>{pendingDelete?.name}</b> and all its tasks? It is shared — this deletes it
              for everyone and cannot be undone.
            </>
          ) : (
            <>
              Delete <b>{pendingDelete?.name}</b> and all its tasks? This cannot be undone.
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
