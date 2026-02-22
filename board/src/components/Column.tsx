import { useState, useRef } from "react";
import { Paper, Text, TextInput, Textarea, ActionIcon, Button, Group, Box } from "@mantine/core";
import { Droppable } from "@hello-pangea/dnd";
import { Plus, Trash2 } from "lucide-react";
import { db, cards } from "@/lib/db";
import type { Card as CardType } from "@/lib/db";
import { Card } from "./Card";

interface ColumnProps {
  columnId: string;
  columnName: string;
  boardId: string;
  cards: CardType[];
  onRenameColumn: (name: string) => void;
  onDeleteColumn: () => void;
  /**
   * When provided (synced path), called instead of db.put so the caller can
   * supply the correct spaceId for shared boards.
   */
  onAddCard?: (columnId: string, title: string, description: string, order: number) => void;
}

export function Column({
  columnId,
  columnName,
  boardId,
  cards: columnCards,
  onRenameColumn,
  onDeleteColumn,
  onAddCard,
}: ColumnProps) {
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newCardDesc, setNewCardDesc] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [headerHovered, setHeaderHovered] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const handleAddCard = () => {
    const title = newCardTitle.trim();
    if (!title) return;
    const maxOrder = columnCards.reduce((max, c) => Math.max(max, c.order), 0);
    const order = maxOrder + 1;
    const description = newCardDesc.trim();

    if (onAddCard) {
      onAddCard(columnId, title, description, order);
    } else {
      db.put(cards, {
        boardId,
        columnId,
        title,
        description,
        color: "",
        order,
      });
    }

    setNewCardTitle("");
    setNewCardDesc("");
    setAddingCard(false);
  };

  const saveColumnName = () => {
    setEditingName(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== columnName) {
      onRenameColumn(trimmed);
    }
  };

  return (
    <Paper
      p="xs"
      radius="md"
      bg="var(--mantine-color-gray-0)"
      style={{
        minWidth: 250,
        maxWidth: 290,
        flex: "0 0 270px",
        display: "flex",
        flexDirection: "column",
        maxHeight: "100%",
      }}
    >
      {/* Column header */}
      <Group
        justify="space-between"
        mb={6}
        px={4}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
      >
        {editingName ? (
          <TextInput
            size="xs"
            value={draftName}
            onChange={(e) => setDraftName(e.currentTarget.value)}
            onBlur={saveColumnName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveColumnName();
              if (e.key === "Escape") setEditingName(false);
            }}
            autoFocus
            style={{ flex: 1 }}
          />
        ) : (
          <Group gap={4}>
            <Text
              fw={600}
              size="sm"
              onClick={() => {
                setDraftName(columnName);
                setEditingName(true);
              }}
              style={{ cursor: "text" }}
            >
              {columnName}
            </Text>
            <Text size="xs" c="dimmed">
              {columnCards.length}
            </Text>
          </Group>
        )}
        <Group
          gap={2}
          style={{
            opacity: headerHovered ? 1 : 0,
            transition: "opacity 150ms",
          }}
        >
          <ActionIcon size="xs" variant="subtle" onClick={() => setAddingCard(true)}>
            <Plus size={14} />
          </ActionIcon>
          <ActionIcon
            size="xs"
            variant="subtle"
            color="gray"
            onClick={() => {
              if (window.confirm(`Delete "${columnName}" and all its cards?`)) {
                onDeleteColumn();
              }
            }}
          >
            <Trash2 size={12} />
          </ActionIcon>
        </Group>
      </Group>

      {/* Droppable card list */}
      <Droppable droppableId={columnId}>
        {(provided) => (
          <Box
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{
              flex: 1,
              overflowY: "auto",
              minHeight: 40,
            }}
          >
            {columnCards.map((card, i) => (
              <Card key={card.id} card={card} index={i} />
            ))}
            {provided.placeholder}
          </Box>
        )}
      </Droppable>

      {/* Add card form */}
      {addingCard ? (
        <Box mt={4}>
          <TextInput
            size="xs"
            placeholder="Card title"
            value={newCardTitle}
            onChange={(e) => setNewCardTitle(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (newCardTitle.trim()) descRef.current?.focus();
              }
              if (e.key === "Escape") {
                setAddingCard(false);
                setNewCardTitle("");
                setNewCardDesc("");
              }
            }}
            autoFocus
          />
          <Textarea
            ref={descRef}
            size="xs"
            mt={4}
            placeholder="Description (optional)"
            value={newCardDesc}
            onChange={(e) => setNewCardDesc(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAddCard();
              }
              if (e.key === "Escape") {
                setAddingCard(false);
                setNewCardTitle("");
                setNewCardDesc("");
              }
            }}
            autosize
            minRows={1}
            maxRows={3}
          />
          <Group gap={4} mt={4}>
            <Button size="compact-xs" onClick={handleAddCard} disabled={!newCardTitle.trim()}>
              Add
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => {
                setAddingCard(false);
                setNewCardTitle("");
                setNewCardDesc("");
              }}
            >
              Cancel
            </Button>
          </Group>
        </Box>
      ) : (
        <Button
          variant="subtle"
          size="compact-xs"
          mt={4}
          leftSection={<Plus size={14} />}
          fullWidth
          justify="flex-start"
          color="gray"
          onClick={() => setAddingCard(true)}
        >
          Add card
        </Button>
      )}
    </Paper>
  );
}
