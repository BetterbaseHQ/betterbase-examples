import { LayoutDashboard } from "lucide-react";
import { ItemsSidebar } from "@betterbase/examples-shared";
import type { Board } from "@/lib/db";

type SidebarBoard = Board & { _spaceId?: string };

interface BoardSidebarProps {
  boards: readonly SidebarBoard[];
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
  return (
    <ItemsSidebar
      label="Boards"
      noun="board"
      childNoun="cards"
      items={boards}
      personalSpaceId={personalSpaceId}
      selectedId={selectedBoardId}
      onSelect={onSelect}
      onCreate={onCreate}
      onDelete={onDelete}
      createPlaceholder="New board..."
      getItemIcon={() => <LayoutDashboard size={14} />}
      getItemCount={(board) => cardCounts[board.id] ?? 0}
    />
  );
}
