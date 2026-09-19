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
import { isShared } from "betterbase/sync";
import { db, cards, type Column as ColumnType } from "@/lib/db";
import type { Board, Card } from "@/lib/db";
import { Column } from "./Column";

/** Deterministic card ordering: fractional order first, id as tie-breaker. */
function compareCards(a: Card, b: Card): number {
  return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

interface BoardViewProps {
  board: Board & { _spaceId?: string };
  columns: ColumnType[];
  cards: Card[];
  personalSpaceId?: string | null;
  isAdmin?: boolean;
  onAddColumn: (name: string) => void;
  onRenameColumn: (columnId: string, name: string) => void;
  onDeleteColumn: (columnId: string) => void;
  /** Called when a card is added in the synced path; undefined in local path. */
  onAddCard?: (
    boardId: string,
    columnId: string,
    title: string,
    description: string,
    order: number,
  ) => void;
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
  columns: boardColumns,
  cards: boardCards,
  personalSpaceId,
  isAdmin = false,
  onAddColumn,
  onRenameColumn,
  onDeleteColumn,
  onAddCard,
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

  const handleAddColumn = () => {
    const name = newColumnName.trim();
    if (!name) return;
    onAddColumn(name);
    setNewColumnName("");
    setAddingColumn(false);
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
      // Only clear the override if it's still the failed move — a newer drag
      // of the same card must keep its own override
      setPendingMoves((prev) => {
        const cur = prev.get(draggableId);
        if (!cur || cur.columnId !== destColumnId || cur.order !== newOrder) return prev;
        const next = new Map(prev);
        next.delete(draggableId);
        return next;
      });
    });
  };

  const isSharedBoard = isShared(board, personalSpaceId);
  const isPersonal = !isSharedBoard;

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
        {isSharedBoard && board._spaceId && onInvite && onRemoveMember && (
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
          {boardColumns.map((col) => {
            const colCards = effectiveCards.filter((c) => c.columnId === col.id).sort(compareCards);
            return (
              <Column
                key={col.id}
                columnId={col.id}
                columnName={col.name}
                boardId={board.id}
                cards={colCards}
                onRenameColumn={(name) => onRenameColumn(col.id, name)}
                onDeleteColumn={() => onDeleteColumn(col.id)}
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
