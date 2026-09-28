import { useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  ScrollArea,
  Text,
  Textarea,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { MoreVertical, MessageSquarePlus, Pencil, Repeat, Trash2 } from "lucide-react";
import type { Thread } from "@/lib/db";
import { previewText, UNTITLED } from "@/lib/titles";
import "./thread-sidebar.css";

export interface ThreadSidebarProps {
  threads: readonly Thread[];
  /** Active thread id; null when the New chat draft is selected. */
  selectedId: string | null;
  loaded: boolean;
  onSelect: (id: string) => void;
  /** Select the persistent New chat draft (creates nothing). */
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  /** Loaded model's display name, pinned to the footer. */
  modelLabel: string;
  /** Open the model picker (disposes the loaded model). */
  onChangeModel: () => void;
}

/**
 * Thread list for the app navbar: a persistent New chat item on top (the
 * draft — the app opens here), then threads newest first (the query sorts
 * on lastMessageAt), with rename and delete per thread behind a hover
 * menu.
 */
export function ThreadSidebar({
  threads,
  selectedId,
  loaded,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  modelLabel,
  onChangeModel,
}: ThreadSidebarProps) {
  const [renaming, setRenaming] = useState<Thread | null>(null);
  const [deleting, setDeleting] = useState<Thread | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const startRename = (thread: Thread) => {
    setDraftTitle(thread.title === UNTITLED ? "" : thread.title);
    setRenaming(thread);
  };
  const commitRename = () => {
    if (renaming && draftTitle.trim() !== "") onRename(renaming.id, draftTitle.trim());
    setRenaming(null);
  };
  const commitDelete = () => {
    if (deleting) onDelete(deleting.id);
    setDeleting(null);
  };

  return (
    <Box p={4} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* The New chat draft — always present, highlighted while active. */}
      <UnstyledButton
        onClick={onNewChat}
        mb="xs"
        px={6}
        py={6}
        w="100%"
        aria-label="Start a new chat"
        aria-current={selectedId === null ? true : undefined}
        style={{
          borderRadius: "var(--mantine-radius-sm)",
          background: selectedId === null ? "var(--mantine-color-default-hover)" : undefined,
        }}
      >
        <Group gap="xs">
          <ThemeIcon size={28} variant="light" radius="md">
            <MessageSquarePlus size={16} />
          </ThemeIcon>
          <Text fz="sm" fw={500}>
            New chat
          </Text>
        </Group>
      </UnstyledButton>

      <ScrollArea flex={1} type="auto">
        {loaded && threads.length === 0 ? (
          <Text size="xs" c="dimmed" px="xs">
            Your chats will appear here.
          </Text>
        ) : (
          threads.map((thread) => {
            const selected = thread.id === selectedId;
            return (
              <Group
                key={thread.id}
                gap="xs"
                px={6}
                py={6}
                wrap="nowrap"
                className="thread-row"
                style={{
                  borderRadius: "var(--mantine-radius-sm)",
                  background: selected ? "var(--mantine-color-default-hover)" : undefined,
                }}
              >
                <UnstyledButton
                  onClick={() => onSelect(thread.id)}
                  aria-current={selected ? true : undefined}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <Text fz="sm" truncate="end">
                    {thread.title === UNTITLED ? "New chat" : thread.title}
                  </Text>
                  <Text fz="xs" c="dimmed" truncate="end">
                    {previewText(thread.lastMessageText) || "No messages yet"}
                  </Text>
                </UnstyledButton>
                {/* Rename/delete live behind a hover-revealed menu —
                    rarely needed, so they never crowd the list. */}
                <Menu shadow="md" width={160} position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      className="thread-row-menu"
                      aria-label="Chat options"
                    >
                      <MoreVertical size={14} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<Pencil size={13} />}
                      onClick={() => startRename(thread)}
                    >
                      Rename
                    </Menu.Item>
                    <Menu.Item
                      color="red"
                      leftSection={<Trash2 size={13} />}
                      onClick={() => setDeleting(thread)}
                    >
                      Delete
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            );
          })
        )}
      </ScrollArea>

      {/* Loaded model + the way back to the picker. */}
      <Group
        justify="space-between"
        wrap="nowrap"
        gap="xs"
        px={8}
        pt={4}
        style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
      >
        <Text fz="xs" c="dimmed" truncate="end">
          {modelLabel}
        </Text>
        <Tooltip label="Change model">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="Change model"
            onClick={onChangeModel}
          >
            <Repeat size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Modal
        opened={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename chat"
        size="sm"
      >
        <Textarea
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.currentTarget.value)}
          data-autofocus
          autosize
          minRows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitRename();
            }
          }}
        />
      </Modal>

      <Modal
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete chat?"
        size="sm"
      >
        <Text size="sm" c="dimmed" mb="md">
          “{deleting?.title === UNTITLED ? "New chat" : deleting?.title}” and all its messages will
          be deleted from this device and your synced devices.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button color="red" size="xs" onClick={commitDelete}>
            Delete
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
