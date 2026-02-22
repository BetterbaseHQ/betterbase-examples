import { useState, useMemo, useEffect } from "react";
import { Group, TextInput, Button, Box, Text } from "@mantine/core";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { Plus } from "lucide-react";
import { ShareButton, MembersPanel } from "@betterbase/examples-shared";
import { db, cards } from "@/lib/db";
import type { Board, Card } from "@/lib/db";
import { Column } from "./Column";

interface BoardViewProps {
  board: Board & { _spaceId?: string };
  cards: Card[];
  personalSpaceId?: string | null;
  isAdmin?: boolean;
  onUpdateBoard: (
    id: string,
    patch: Partial<Omit<Board, "id" | "createdAt" | "updatedAt">>,
  ) => void;
  /** Called when a card is added in the synced path; undefined in local path. */
  onAddCard?: (
    boardId: string,
    columnId: string,
    title: string,
    description: string,
    order: number,
  ) => void;
  /** Called when cards are deleted (column deletion) in the synced path. */
  onDeleteColumnCards?: (cardIds: string[]) => void;
  /** Called when a card is moved via drag-and-drop in the synced path. */
  onMoveCard?: (cardId: string, columnId: string, order: number) => void;
  onShare?: (handle: string) => Promise<void>;
  onInvite?: (handle: string) => Promise<void>;
  onRemoveMember?: (did: string) => Promise<void>;
}

// Optimistic override applied immediately on drag, cleared when DB catches up
type PendingMove = {
  cardId: string;
  columnId: string;
  order: number;
};

export function BoardView({
  board,
  cards: boardCards,
  personalSpaceId,
  isAdmin = false,
  onUpdateBoard,
  onAddCard,
  onDeleteColumnCards,
  onMoveCard,
  onShare,
  onInvite,
  onRemoveMember,
}: BoardViewProps) {
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  // Merge optimistic move into the card list so there's no flicker
  const effectiveCards = useMemo(() => {
    if (!pendingMove) return boardCards;
    return boardCards.map((c) =>
      c.id === pendingMove.cardId
        ? { ...c, columnId: pendingMove.columnId, order: pendingMove.order }
        : c,
    );
  }, [boardCards, pendingMove]);

  // Clear optimistic state once the DB has caught up
  useEffect(() => {
    if (!pendingMove) return;
    const card = boardCards.find((c) => c.id === pendingMove.cardId);
    if (card && card.columnId === pendingMove.columnId && card.order === pendingMove.order) {
      setPendingMove(null);
    }
  }, [boardCards, pendingMove]);

  const handleAddColumn = () => {
    const name = newColumnName.trim();
    if (!name) return;
    const newColumn = { id: crypto.randomUUID(), name };
    onUpdateBoard(board.id, { columns: [...board.columns, newColumn] });
    setNewColumnName("");
    setAddingColumn(false);
  };

  const renameColumn = (columnId: string, name: string) => {
    const updated = board.columns.map((c) => (c.id === columnId ? { ...c, name } : c));
    onUpdateBoard(board.id, { columns: updated });
  };

  const deleteColumn = (columnId: string) => {
    const cardIds = boardCards.filter((c) => c.columnId === columnId).map((c) => c.id);
    if (onDeleteColumnCards) {
      onDeleteColumnCards(cardIds);
    } else {
      cardIds.forEach((id) => db.delete(cards, id));
    }
    const updated = board.columns.filter((c) => c.id !== columnId);
    onUpdateBoard(board.id, { columns: updated });
  };

  const handleDragEnd = (result: DropResult) => {
    const { draggableId, source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index)
      return;

    const destColumnId = destination.droppableId;
    const destCards = effectiveCards
      .filter((c) => c.columnId === destColumnId)
      .sort((a, b) => a.order - b.order);

    // Remove the dragged card from dest list if moving within same column
    const filteredDest =
      source.droppableId === destColumnId
        ? destCards.filter((c) => c.id !== draggableId)
        : destCards;

    // Calculate new order
    let newOrder: number;
    if (filteredDest.length === 0) {
      newOrder = 1;
    } else if (destination.index === 0) {
      newOrder = filteredDest[0]!.order - 1;
    } else if (destination.index >= filteredDest.length) {
      newOrder = filteredDest[filteredDest.length - 1]!.order + 1;
    } else {
      const before = filteredDest[destination.index - 1]!.order;
      const after = filteredDest[destination.index]!.order;
      newOrder = (before + after) / 2;
    }

    // Apply optimistic update immediately, then persist
    setPendingMove({
      cardId: draggableId,
      columnId: destColumnId,
      order: newOrder,
    });

    if (onMoveCard) {
      onMoveCard(draggableId, destColumnId, newOrder);
    } else {
      db.patch(cards, {
        id: draggableId,
        columnId: destColumnId,
        order: newOrder,
      });
    }
  };

  const isPersonal = board._spaceId == null || board._spaceId === personalSpaceId;
  const isShared = board._spaceId != null && !isPersonal;

  return (
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Board header with sharing controls */}
      <Group
        justify="space-between"
        px="sm"
        py={8}
        style={{
          borderBottom: "1px solid var(--mantine-color-gray-3)",
          flexShrink: 0,
        }}
      >
        <Text fw={600} size="lg">
          {board.name}
        </Text>
        {isPersonal && onShare && <ShareButton onShare={onShare} />}
        {isShared && board._spaceId && onInvite && onRemoveMember && (
          <MembersPanel
            spaceId={board._spaceId}
            isAdmin={isAdmin}
            onInvite={onInvite}
            onRemoveMember={onRemoveMember}
          />
        )}
      </Group>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Group
          gap="sm"
          align="flex-start"
          wrap="nowrap"
          p="sm"
          style={{
            flex: 1,
            overflowX: "auto",
            overflowY: "hidden",
            paddingRight: 48,
          }}
        >
          {board.columns.map((col) => {
            const colCards = effectiveCards
              .filter((c) => c.columnId === col.id)
              .sort((a, b) => a.order - b.order);
            return (
              <Column
                key={col.id}
                columnId={col.id}
                columnName={col.name}
                boardId={board.id}
                cards={colCards}
                onRenameColumn={(name) => renameColumn(col.id, name)}
                onDeleteColumn={() => deleteColumn(col.id)}
                onAddCard={
                  onAddCard
                    ? (columnId, title, description, order) =>
                        onAddCard(board.id, columnId, title, description, order)
                    : undefined
                }
              />
            );
          })}

          {/* Add column */}
          {addingColumn ? (
            <TextInput
              size="xs"
              placeholder="Column name"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddColumn();
                if (e.key === "Escape") {
                  setAddingColumn(false);
                  setNewColumnName("");
                }
              }}
              onBlur={() => {
                if (newColumnName.trim()) handleAddColumn();
                else {
                  setAddingColumn(false);
                  setNewColumnName("");
                }
              }}
              style={{ minWidth: 200, flexShrink: 0 }}
              autoFocus
            />
          ) : (
            <Button
              variant="subtle"
              size="compact-sm"
              color="gray"
              leftSection={<Plus size={14} />}
              onClick={() => setAddingColumn(true)}
              style={{ flexShrink: 0 }}
            >
              Add column
            </Button>
          )}
        </Group>
      </DragDropContext>
    </Box>
  );
}
