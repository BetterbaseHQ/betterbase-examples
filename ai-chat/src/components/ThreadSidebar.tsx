import { useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Modal,
  ScrollArea,
  Text,
  Textarea,
  ThemeIcon,
  UnstyledButton,
} from "@mantine/core";
import { MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import type { Thread } from "@/lib/db";
import { UNTITLED } from "@/lib/titles";

export interface ThreadSidebarProps {
  threads: readonly Thread[];
  selectedId: string | null;
  loaded: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Thread list for the app navbar: newest first (the query sorts on
 * lastMessageAt), with rename and delete per thread.
 */
export function ThreadSidebar({
  threads,
  selectedId,
  loaded,
  onSelect,
  onCreate,
  onRename,
  onDelete,
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
    <Box p="xs" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <UnstyledButton onClick={onCreate} mb="xs" px="xs" py={8} aria-label="Start a new chat">
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
                px="xs"
                py={6}
                wrap="nowrap"
                style={{
                  borderRadius: "var(--mantine-radius-sm)",
                  background: selected ? "var(--mantine-color-default-hover)" : undefined,
                }}
              >
                <UnstyledButton
                  onClick={() => onSelect(thread.id)}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <Text fz="sm" truncate="end">
                    {thread.title === UNTITLED ? "New chat" : thread.title}
                  </Text>
                  <Text fz="xs" c="dimmed" truncate="end">
                    {thread.lastMessageText || "No messages yet"}
                  </Text>
                </UnstyledButton>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label="Rename chat"
                  onClick={() => startRename(thread)}
                >
                  <Pencil size={13} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  aria-label="Delete chat"
                  onClick={() => setDeleting(thread)}
                >
                  <Trash2 size={13} />
                </ActionIcon>
              </Group>
            );
          })
        )}
      </ScrollArea>

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
