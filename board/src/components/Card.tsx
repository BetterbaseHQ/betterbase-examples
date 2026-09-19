import { useState, useEffect } from "react";
import {
  Paper,
  Text,
  TextInput,
  Textarea,
  ActionIcon,
  Group,
  ColorSwatch,
  Popover,
  SimpleGrid,
} from "@mantine/core";
import { Draggable } from "@hello-pangea/dnd";
import { Trash2, Palette, AlignLeft } from "lucide-react";
import { ConfirmDialog, reportError } from "@betterbase/examples-shared";
import type { Card as CardType } from "@/lib/db";
import { db, cards } from "@/lib/db";

const LABEL_COLORS = [
  "",
  "#e03131",
  "#f08c00",
  "#2f9e44",
  "#1971c2",
  "#7048e8",
  "#e64980",
  "#868e96",
];

const SAFE_COLORS = new Set(LABEL_COLORS.filter(Boolean));

interface CardProps {
  card: CardType;
  index: number;
}

export function Card({ card, index }: CardProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync local state when card changes from external source (sync)
  useEffect(() => {
    if (!editingTitle) setTitle(card.title);
  }, [card.title, editingTitle]);

  useEffect(() => {
    if (!editingDesc) setDescription(card.description);
  }, [card.description, editingDesc]);

  const saveTitle = () => {
    setEditingTitle(false);
    const trimmed = title.trim();
    if (trimmed && trimmed !== card.title) {
      db.patch(cards, { id: card.id, title: trimmed }).catch((err) =>
        reportError(err, "Couldn't save card"),
      );
    } else {
      setTitle(card.title);
    }
  };

  const saveDescription = () => {
    setEditingDesc(false);
    if (description !== card.description) {
      db.patch(cards, { id: card.id, description }).catch((err) =>
        reportError(err, "Couldn't save card"),
      );
    }
  };

  const setColor = (color: string) => {
    db.patch(cards, { id: card.id, color }).catch((err) => reportError(err, "Couldn't save card"));
  };

  const deleteCard = () => {
    db.delete(cards, card.id).catch((err) => reportError(err, "Couldn't delete card"));
  };

  return (
    <Draggable draggableId={card.id} index={index}>
      {(provided) => (
        <Paper
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          shadow="xs"
          px="sm"
          py={6}
          mb={4}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          style={{
            ...provided.draggableProps.style,
            borderLeft:
              card.color && SAFE_COLORS.has(card.color) ? `3px solid ${card.color}` : undefined,
          }}
        >
          {editingTitle ? (
            <TextInput
              size="xs"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") {
                  setTitle(card.title);
                  setEditingTitle(false);
                }
              }}
              autoFocus
            />
          ) : (
            <Text
              size="sm"
              fw={500}
              onClick={() => setEditingTitle(true)}
              style={{ cursor: "text" }}
            >
              {card.title || "Untitled"}
            </Text>
          )}

          {editingDesc ? (
            <Textarea
              size="xs"
              mt={2}
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              onBlur={saveDescription}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDescription(card.description);
                  setEditingDesc(false);
                }
              }}
              autosize
              minRows={1}
              maxRows={4}
              autoFocus
            />
          ) : card.description ? (
            <Text
              size="xs"
              c="dimmed"
              mt={2}
              onClick={() => setEditingDesc(true)}
              style={{ cursor: "text" }}
            >
              {card.description}
            </Text>
          ) : null}

          <Group
            gap={4}
            mt={4}
            justify="flex-end"
            style={{
              opacity: hovered ? 1 : 0,
              transition: "opacity 150ms",
            }}
          >
            {!card.description && (
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                aria-label="Add description"
                onClick={() => setEditingDesc(true)}
              >
                <AlignLeft size={12} />
              </ActionIcon>
            )}
            <Popover position="bottom" withArrow shadow="md">
              <Popover.Target>
                <ActionIcon size="xs" variant="subtle" color="gray" aria-label="Set card color">
                  <Palette size={12} />
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown p="xs">
                <SimpleGrid cols={4} spacing={4}>
                  {LABEL_COLORS.map((c) => (
                    <ColorSwatch
                      key={c || "none"}
                      color={c || "var(--mantine-color-gray-2)"}
                      size={20}
                      component="button"
                      aria-label={c ? `Set color ${c}` : "Clear color"}
                      onClick={() => setColor(c)}
                      style={{
                        cursor: "pointer",
                        outline:
                          card.color === c ? "2px solid var(--mantine-color-blue-5)" : undefined,
                        outlineOffset: 1,
                      }}
                    />
                  ))}
                </SimpleGrid>
              </Popover.Dropdown>
            </Popover>
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              aria-label={`Delete card ${card.title}`}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={12} />
            </ActionIcon>
          </Group>
          <ConfirmDialog
            opened={confirmDelete}
            title="Delete card"
            message={`Delete "${card.title || "Untitled"}"? This cannot be undone.`}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => {
              setConfirmDelete(false);
              deleteCard();
            }}
          />
        </Paper>
      )}
    </Draggable>
  );
}
