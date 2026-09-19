import { useState, useMemo, useEffect } from "react";
import { Group, Button, Box, Text } from "@mantine/core";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { Plus } from "lucide-react";
import {
  ShareButton,
  MembersPanel,
  InlineTextInput,
  reportError,
} from "@betterbase/examples-shared";
import { db, cards } from "@/lib/db";
import type { Board, Card } from "@/lib/db";
import { Column } from "./Column";

/** Deterministic card ordering: fractional order first, id as tie-breaker. */
function compareCards(a: Card, b: Card): number {
  return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

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
  onMoveCard?: (cardId: string, columnId: string, order: number) => void | Promise<void>;
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
  // Optimistic overrides keyed by card id: applied immediately on drag so
  // there's no flicker, cleared per-card once the DB catches up (or on failure).
  const [pendingMoves, setPendingMoves] = useState<Map<string, PendingMove>>(() => new Map());

  const effectiveCards = useMemo(() => {
    if (pendingMoves.size === 0) return boardCards;
    return boardCards.map((c) => {
      const p = pendingMoves.get(c.id);
      return p ? { ...c, columnId: p.columnId, order: p.order } : c;
    });
  }, [boardCards, pendingMoves]);

  // Drop overrides that the DB has caught up with
  useEffect(() => {
    if (pendingMoves.size === 0) return;
    const settled: string[] = [];
    for (const p of pendingMoves.values()) {
      const card = boardCards.find((c) => c.id === p.cardId);
      if (card && card.columnId === p.columnId && card.order === p.order) {
        settled.push(p.cardId);
      }
    }
    if (settled.length > 0) {
      setPendingMoves((prev) => {
        const next = new Map(prev);
        for (const id of settled) next.delete(id);
        return next;
      });
    }
  }, [boardCards, pendingMoves]);

  const clearPendingMove = (cardId: string) => {
    setPendingMoves((prev) => {
      if (!prev.has(cardId)) return prev;
      const next = new Map(prev);
      next.delete(cardId);
      return next;
    });
  };

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
      Promise.resolve(onDeleteColumnCards(cardIds)).catch((err) =>
        reportError(err, "Couldn't delete column"),
      );
    } else {
      cardIds.forEach((id) =>
        db.delete(cards, id).catch((err) => reportError(err, "Couldn't delete card")),
      );
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
    const destCards = effectiveCards.filter((c) => c.columnId === destColumnId).sort(compareCards);

    // Remove the dragged card from dest list if moving within same column
    const filteredDest =
      source.droppableId === destColumnId
        ? destCards.filter((c) => c.id !== draggableId)
        : destCards;

    // Calculate new order (midpoint of neighbors; float precision allows ~50
    // consecutive inserts at one spot before orders need rebalancing)
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
    setPendingMoves((prev) =>
      new Map(prev).set(draggableId, {
        cardId: draggableId,
        columnId: destColumnId,
        order: newOrder,
      }),
    );

    const persist = onMoveCard
      ? onMoveCard(draggableId, destColumnId, newOrder)
      : db.patch(cards, { id: draggableId, columnId: destColumnId, order: newOrder });
    Promise.resolve(persist).catch((err) => {
      reportError(err, "Couldn't move card");
      clearPendingMove(draggableId);
    });
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
            const colCards = effectiveCards.filter((c) => c.columnId === col.id).sort(compareCards);
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
            <InlineTextInput
              placeholder="Column name"
              ariaLabel="New column name"
              value={newColumnName}
              onChange={setNewColumnName}
              onSubmit={handleAddColumn}
              onCancel={() => {
                setAddingColumn(false);
                setNewColumnName("");
              }}
              style={{ minWidth: 200, flexShrink: 0 }}
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
