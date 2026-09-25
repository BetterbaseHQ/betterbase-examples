import { Circle } from "lucide-react";
import { ItemsSidebar } from "@betterbase/examples-shared";
import type { List } from "@/lib/db";

export const LIST_COLORS = [
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

/** The single color-rotation policy for new lists (sidebar + first-run CTA). */
export function nextListColor(count: number): ListColor {
  return LIST_COLORS[count % LIST_COLORS.length]!;
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
  return (
    <ItemsSidebar
      label="Lists"
      noun="list"
      childNoun="tasks"
      items={lists}
      personalSpaceId={personalSpaceId}
      selectedId={selectedListId}
      onSelect={onSelect}
      onCreate={(name) => onCreate(name, nextListColor(lists.length))}
      onDelete={onDelete}
      createPlaceholder="New list..."
      getItemIcon={(list) => {
        const color = listColor(list.color);
        return (
          <Circle
            size={10}
            fill={`var(--mantine-color-${color}-6)`}
            color={`var(--mantine-color-${color}-6)`}
          />
        );
      }}
      getItemCount={(list) => list.todos.filter((t) => !t.completed).length}
    />
  );
}
