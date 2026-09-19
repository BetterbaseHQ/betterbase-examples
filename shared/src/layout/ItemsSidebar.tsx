import { useState, type ReactNode } from "react";
import { NavLink, TextInput, ActionIcon, Group, Stack, Text, ScrollArea } from "@mantine/core";
import { Plus, Trash2, Users } from "lucide-react";
import { isShared } from "betterbase/sync";
import { ConfirmDialog } from "../components/ConfirmDialog.js";

/** Minimum shape ItemsSidebar needs from an item. */
export interface ItemsSidebarItem {
  id: string;
  name: string;
  /** Present on synced records; drives the shared indicator + confirm copy. */
  _spaceId?: string;
}

interface ItemsSidebarProps<T extends ItemsSidebarItem> {
  /** Section header (e.g. "Lists"). */
  label: string;
  /** Singular noun for a11y labels and dialog titles (e.g. "list"). */
  noun: string;
  /** What deleting destroys besides the item (e.g. "tasks"). */
  childNoun: string;
  items: readonly T[];
  personalSpaceId?: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  createPlaceholder?: string;
  /** Optional per-item left icon (e.g. a color dot). */
  getItemIcon?: (item: T) => ReactNode;
  /** Optional per-item count badge; return null/0 to hide. */
  getItemCount?: (item: T) => number | null;
}

/**
 * Generic sidebar list: nav items + inline create + confirm-on-delete with
 * the shared-vs-personal warning. The parameterized version of what every
 * example app hand-rolled (notebooks, albums, boards, lists).
 */
export function ItemsSidebar<T extends ItemsSidebarItem>({
  label,
  noun,
  childNoun,
  items,
  personalSpaceId,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  createPlaceholder,
  getItemIcon,
  getItemCount,
}: ItemsSidebarProps<T>) {
  const [newItemName, setNewItemName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<T | null>(null);

  const handleCreate = () => {
    const name = newItemName.trim();
    if (!name) return;
    onCreate(name);
    setNewItemName("");
  };

  const pendingDeleteIsShared = pendingDelete != null && isShared(pendingDelete, personalSpaceId);

  return (
    <Stack gap="xs" h="100%">
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="xs">
        {label}
      </Text>

      <ScrollArea flex={1}>
        <Stack gap={2}>
          {items.map((item) => {
            const shared = isShared(item, personalSpaceId);
            const count = getItemCount?.(item) ?? null;
            return (
              <NavLink
                key={item.id}
                active={item.id === selectedId}
                onClick={() => onSelect(item.id)}
                label={item.name}
                leftSection={getItemIcon?.(item)}
                rightSection={
                  <Group gap={4} wrap="nowrap">
                    {shared && <Users size={12} color="var(--mantine-color-blue-5)" />}
                    {count != null && count > 0 && (
                      <Text size="xs" c="dimmed">
                        {count}
                      </Text>
                    )}
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      aria-label={`Delete ${noun} ${item.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(item);
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
        placeholder={createPlaceholder ?? `New ${noun}...`}
        aria-label={`New ${noun} name`}
        size="sm"
        value={newItemName}
        onChange={(e) => setNewItemName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleCreate();
        }}
        rightSection={
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label={`Create ${noun}`}
            onClick={handleCreate}
            disabled={!newItemName.trim()}
          >
            <Plus size={16} />
          </ActionIcon>
        }
      />

      <ConfirmDialog
        opened={pendingDelete != null}
        title={`Delete ${noun}`}
        message={
          pendingDeleteIsShared ? (
            <>
              Delete <b>{pendingDelete?.name}</b> and all its {childNoun}? It is shared — this
              deletes it for everyone and cannot be undone.
            </>
          ) : (
            <>
              Delete <b>{pendingDelete?.name}</b> and all its {childNoun}? This cannot be undone.
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
