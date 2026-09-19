import { Stack, NavLink, Text } from "@mantine/core";
import { FileText, Star, Book } from "lucide-react";
import { ItemsSidebar } from "@betterbase/examples-shared";
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
  return (
    <Stack gap={0} p="xs" h="100%">
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

      <ItemsSidebar
        label="Notebooks"
        noun="notebook"
        childNoun="notes"
        items={notebooks}
        personalSpaceId={personalSpaceId}
        selectedId={view.kind === "notebook" ? view.id : null}
        onSelect={(id) => onViewChange({ kind: "notebook", id })}
        onCreate={onCreate}
        onDelete={onDelete}
        createPlaceholder="New notebook..."
        getItemIcon={() => <Book size={16} />}
        getItemCount={(nb) => counts.byNotebook[nb.id] ?? 0}
      />
    </Stack>
  );
}
