import { useState, useEffect, useRef, useMemo } from "react";
import { Stack, Group, Text, TextInput, ActionIcon, ScrollArea, Box } from "@mantine/core";
import { Send, MessageCircle } from "lucide-react";
import {
  EmptyState,
  MembersPanel,
  PresenceAvatars,
  TypingIndicator,
  useTyping,
} from "@betterbase/examples-shared";
import { usePresence } from "betterbase/sync/react";
import type { Conversation, Message } from "@/lib/db";
import { MessageBubble } from "./MessageBubble";
import { shortHandle } from "@/lib/handle";
import type { SpaceFields } from "betterbase/sync";

type MessageWithChain = Message & { _editChainValid?: boolean };

interface ChatViewProps {
  conversation: (Conversation & SpaceFields) | null;
  messages: readonly Message[];
  currentHandle: string | null;
  isAdmin: boolean;
  onSendMessage: (text: string) => void;
  onInvite: (handle: string) => Promise<void>;
  onRemoveMember: (did: string) => Promise<void>;
}

export function ChatView({
  conversation,
  messages,
  currentHandle,
  isAdmin,
  onSendMessage,
  onInvite,
  onRemoveMember,
}: ChatViewProps) {
  const [text, setText] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);

  // Presence & typing
  usePresence(conversation?._spaceId, currentHandle ? { handle: currentHandle } : undefined);
  const { typingPeers, sendTyping } = useTyping(conversation?._spaceId, currentHandle);

  // Auto-scroll to bottom only when already near the bottom
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);

  const senderHandles = useMemo(
    () => [...new Set(messages.map((m) => m.senderHandle))],
    [messages],
  );

  if (!conversation) {
    return (
      <Box
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <EmptyState
          icon={<MessageCircle size={32} />}
          title="No conversation selected"
          description='Click "+" to start a new conversation'
        />
      </Box>
    );
  }

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setText("");
  };

  return (
    <Stack gap={0} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Group
        px="md"
        py="sm"
        justify="space-between"
        style={{
          borderBottom: "1px solid var(--mantine-color-gray-2)",
          flexShrink: 0,
        }}
      >
        <Group gap="sm" align="center">
          <Text fw={600}>{conversation.name}</Text>
          <PresenceAvatars spaceId={conversation._spaceId} />
        </Group>
        {conversation._spaceId && (
          <MembersPanel
            spaceId={conversation._spaceId}
            isAdmin={isAdmin}
            onInvite={onInvite}
            onRemoveMember={onRemoveMember}
          />
        )}
      </Group>

      {/* Messages */}
      <ScrollArea style={{ flex: 1 }} viewportRef={viewportRef} offsetScrollbars>
        <Stack gap={0} py="sm">
          {messages.length === 0 && (
            <Box py="xl">
              <EmptyState
                icon={<MessageCircle size={24} />}
                title="No messages yet"
                description="Send the first message!"
              />
            </Box>
          )}
          {messages.map((msg) => {
            const m = msg as MessageWithChain;
            return (
              <MessageBubble
                key={m.id}
                message={m}
                isOwn={m.senderHandle === currentHandle}
                senderDisplay={shortHandle(m.senderHandle, senderHandles)}
                verified={
                  // Own messages omitted: edit chain lags until next sync round-trip
                  m.senderHandle !== currentHandle && m._editChainValid === true
                }
              />
            );
          })}
        </Stack>
      </ScrollArea>

      {/* Typing indicator */}
      <Box px="md">
        <TypingIndicator typingPeers={typingPeers} />
      </Box>

      {/* Input */}
      <Group
        px="md"
        py="sm"
        gap="xs"
        style={{
          borderTop: "1px solid var(--mantine-color-gray-2)",
          flexShrink: 0,
        }}
      >
        <TextInput
          placeholder="Type a message…"
          value={text}
          onChange={(e) => {
            setText(e.currentTarget.value);
            sendTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          style={{ flex: 1 }}
        />
        <ActionIcon size="lg" variant="filled" disabled={!text.trim()} onClick={handleSend}>
          <Send size={16} />
        </ActionIcon>
      </Group>
    </Stack>
  );
}
