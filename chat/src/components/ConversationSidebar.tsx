import { useState, useMemo } from "react";
import { Stack, NavLink, TextInput, ActionIcon, Group, Text, Modal, Button } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useMembers } from "@betterbase/sdk/sync/react";
import { MessageCircle, Plus, Trash2, Pencil } from "lucide-react";
import type { Conversation } from "@/lib/db";
import { shortHandle } from "@/lib/handle";

interface ConversationSidebarProps {
  conversations: readonly (Conversation & { _spaceId?: string })[];
  personalSpaceId?: string | null;
  currentHandle: string | null;
  selectedConversationId: string | null;
  onSelect: (id: string) => void;
  onStartChat: (recipientHandle: string, name?: string) => Promise<void>;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

// ---------------------------------------------------------------------------
// NewChatModal
// ---------------------------------------------------------------------------

function NewChatModal({
  opened,
  onClose,
  onStartChat,
}: {
  opened: boolean;
  onClose: () => void;
  onStartChat: (recipientHandle: string, name?: string) => Promise<void>;
}) {
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const h = handle.trim();
    if (!h) return;
    setLoading(true);
    setError("");
    try {
      await onStartChat(h, name.trim() || undefined);
      setHandle("");
      setName("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start chat");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setHandle("");
    setName("");
    setError("");
    onClose();
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="New conversation" size="sm">
      <Stack gap="sm">
        <TextInput
          label="Chat with"
          placeholder="user@domain"
          value={handle}
          onChange={(e) => setHandle(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          autoFocus
        />
        <TextInput
          label="Conversation name"
          description="Optional — leave blank to use member names"
          placeholder="e.g. Team discussion"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
        />
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        <Button loading={loading} disabled={!handle.trim()} onClick={handleSubmit} fullWidth mt={4}>
          Start conversation
        </Button>
      </Stack>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ConversationNavItem — computes display name from space members
// ---------------------------------------------------------------------------

function ConversationNavItem({
  conv,
  currentHandle,
  isSelected,
  onSelect,
  onDelete,
  onRename,
}: {
  conv: Conversation & { _spaceId?: string };
  currentHandle: string | null;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const { members } = useMembers(conv._spaceId ?? "");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // If a custom name is stored, show it. Otherwise compute from members.
  const displayName = useMemo(() => {
    if (conv.name) return conv.name;
    const visible = members.filter(
      (m) => (m.status === "joined" || m.status === "pending") && m.handle !== currentHandle,
    );
    const allHandles = visible.map((m) => m.handle).filter((h): h is string => !!h);
    const others = visible.map((m) =>
      m.handle ? shortHandle(m.handle, allHandles) : m.did.slice(0, 8),
    );
    return others.length > 0 ? others.join(", ") : "…";
  }, [conv.name, members, currentHandle]);

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(conv.name); // empty string = currently auto
    setRenaming(true);
  };

  const commitRename = () => {
    onRename(renameValue.trim()); // empty string = back to auto
    setRenaming(false);
  };

  if (renaming) {
    return (
      <TextInput
        size="xs"
        value={renameValue}
        placeholder="Member names (auto)"
        onChange={(e) => setRenameValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitRename();
          if (e.key === "Escape") setRenaming(false);
        }}
        onBlur={commitRename}
        mx={4}
        mb={2}
        autoFocus
      />
    );
  }

  return (
    <NavLink
      label={displayName}
      description={
        conv.lastMessageText ? (
          <Text size="xs" c="dimmed" truncate>
            {conv.lastMessageText}
          </Text>
        ) : undefined
      }
      leftSection={<MessageCircle size={14} />}
      rightSection={
        <Group gap={2} wrap="nowrap">
          <ActionIcon size="xs" variant="subtle" onClick={startRename}>
            <Pencil size={11} />
          </ActionIcon>
          <ActionIcon
            size="xs"
            variant="subtle"
            color="red"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={11} />
          </ActionIcon>
        </Group>
      }
      active={isSelected}
      onClick={onSelect}
      py={4}
      px={8}
      fz="sm"
      styles={{ label: { fontSize: "var(--mantine-font-size-sm)" } }}
    />
  );
}

// ---------------------------------------------------------------------------
// ConversationSidebar
// ---------------------------------------------------------------------------

export function ConversationSidebar({
  conversations,
  currentHandle,
  selectedConversationId,
  onSelect,
  onStartChat,
  onDelete,
  onRename,
}: ConversationSidebarProps) {
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  return (
    <Stack gap={0} p={4}>
      <Group justify="space-between" mb={2} px={8}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Conversations
        </Text>
        <ActionIcon size="xs" variant="subtle" onClick={openModal}>
          <Plus size={14} />
        </ActionIcon>
      </Group>

      <NewChatModal opened={modalOpened} onClose={closeModal} onStartChat={onStartChat} />

      {conversations.map((conv) => (
        <ConversationNavItem
          key={conv.id}
          conv={conv}
          currentHandle={currentHandle}
          isSelected={selectedConversationId === conv.id}
          onSelect={() => onSelect(conv.id)}
          onDelete={() => onDelete(conv.id)}
          onRename={(name) => onRename(conv.id, name)}
        />
      ))}
    </Stack>
  );
}
