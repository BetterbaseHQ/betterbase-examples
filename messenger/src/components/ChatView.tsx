import { useState, useEffect, useRef, useMemo } from "react";
import { Stack, Group, Text, TextInput, ActionIcon, ScrollArea, Box, Button } from "@mantine/core";
import { Send, MessageCircle } from "lucide-react";
import {
  EmptyState,
  MembersPanel,
  PresenceAvatars,
  RemovedSpaceNotice,
  TypingIndicator,
} from "@betterbase/examples-shared";
import { useMembers, usePresence, useSpaceStatus, useTyping } from "betterbase/sync/react";
import type { Conversation, Message } from "@/lib/db";
import { MessageBubble } from "./MessageBubble";
import { shortHandle } from "@/lib/handle";
import type { SpaceFields } from "betterbase/sync";

type MessageWithChain = Message & Pick<SpaceFields, "_editChain" | "_editChainValid">;

interface ChatViewProps {
  conversation: (Conversation & SpaceFields) | null;
  messages: readonly Message[];
  currentHandle: string | null;
  isAdmin: boolean;
  /** Whether any conversation exists — first-run gets a creation CTA. */
  hasConversations: boolean;
  /** Opens the new-conversation modal (shared with the sidebar "+"). */
  onStartConversation: () => void;
  /** Local cleanup when the victim of a removal deletes their copy. */
  onDeleteConversation: (id: string) => void | Promise<void>;
  /** `id` (when provided) makes the commit idempotent across retries. */
  onSendMessage: (text: string, id?: string) => Promise<void>;
  onInvite: (handle: string) => Promise<void>;
  onRemoveMember: (did: string) => Promise<void>;
}

export function ChatView({
  conversation,
  messages,
  currentHandle,
  isAdmin,
  hasConversations,
  onStartConversation,
  onDeleteConversation,
  onSendMessage,
  onInvite,
  onRemoveMember,
}: ChatViewProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingLocalCopy, setDeletingLocalCopy] = useState(false);
  // AUD-051: a failed send keeps its submission id so a retry of the same
  // text overwrites the same record instead of duplicating it — the first
  // attempt may already have committed the message before its preview
  // patch failed.
  const failedAttemptRef = useRef<{ text: string; id: string } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Presence & typing
  usePresence(conversation?._spaceId, currentHandle ? { handle: currentHandle } : undefined);
  const { typingPeers, sendTyping } = useTyping(conversation?._spaceId, currentHandle);

  // AUD-050: membership is the authenticated did→handle mapping that
  // sender attribution is verified against (the message's `senderHandle`
  // is writable content; the edit chain's author did is cryptographic).
  const { members } = useMembers(conversation?._spaceId);

  // Removal flips the space's local record to "removed" (via revocation
  // handling) — the conversation freezes: no messages render, the composer
  // is gone, and only the local-copy cleanup remains.
  const { status: spaceStatus } = useSpaceStatus(conversation?._spaceId);
  const removed = spaceStatus === "removed";

  // Jump to the bottom once per conversation — on switch or when the first
  // batch of history arrives (queries start empty and fill in async, so the
  // jump must wait for a non-empty list). Without this, the near-bottom guard
  // below would keep the viewport pinned at the oldest messages.
  const jumpedFor = useRef<string | null>(null);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || messages.length === 0) return undefined;
    const convKey = conversation?.id ?? null;
    if (jumpedFor.current !== convKey) {
      jumpedFor.current = convKey;
      const jump = () => {
        const viewport = viewportRef.current;
        viewport?.scrollTo({ top: viewport.scrollHeight });
      };
      jump();
      // The ref may not be attached yet (ScrollArea mounts the viewport
      // child), and content may not have laid out on first paint with cached
      // history — re-apply once both settle.
      const frame = requestAnimationFrame(jump);
      return () => cancelAnimationFrame(frame);
    }
    // Follow new messages, but only when already near the bottom (so reading
    // history isn't yanked around by incoming messages).
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    return undefined;
  }, [messages, conversation?.id]);

  const handleByDid = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      if (member.handle) map.set(member.did, member.handle);
    }
    return map;
  }, [members]);

  // AUD-050: resolve a message's cryptographic author to a member handle.
  // Only a chain that passed integrity verification is trusted — a
  // tampered chain must not drive display attribution.
  const resolveAttribution = (m: MessageWithChain): string | undefined => {
    if (m._editChainValid !== true) return undefined;
    const chain = m._editChain;
    // The first chain entry is the record's creator; later entries are
    // edits, which don't change who sent it.
    const authorDid = chain !== undefined && chain.length > 0 ? chain[0]!.author : undefined;
    return authorDid !== undefined ? handleByDid.get(authorDid) : undefined;
  };

  const senderHandles = useMemo(() => {
    const names = new Set<string>();
    for (const msg of messages) {
      const m = msg as MessageWithChain;
      names.add(resolveAttribution(m) ?? m.senderHandle);
    }
    return [...names];
    // resolveAttribution closes over handleByDid only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, handleByDid]);

  if (!conversation) {
    const firstRun = !hasConversations;
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
          title={firstRun ? "No conversations yet" : "No conversation selected"}
          description={
            firstRun
              ? "Start a conversation to exchange encrypted messages"
              : "Pick a conversation from the sidebar"
          }
          action={
            firstRun ? (
              <Button size="xs" onClick={onStartConversation}>
                New conversation
              </Button>
            ) : undefined
          }
        />
      </Box>
    );
  }

  if (removed) {
    return (
      <Box
        style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          height: "100%",
        }}
        px="md"
        py="xl"
      >
        <RemovedSpaceNotice
          kindLabel="conversation"
          name={conversation.name}
          deleting={deletingLocalCopy}
          onDeleteLocalCopy={() => {
            setDeletingLocalCopy(true);
            Promise.resolve(onDeleteConversation(conversation.id)).finally(() => {
              setDeletingLocalCopy(false);
            });
          }}
        />
      </Box>
    );
  }

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const id =
      failedAttemptRef.current?.text === trimmed
        ? failedAttemptRef.current.id
        : crypto.randomUUID();
    setSending(true);
    onSendMessage(trimmed, id)
      .then(() => {
        failedAttemptRef.current = null;
        // AUD-051: clear only the submitted draft — the user may have
        // started typing a replacement while the send was pending, and
        // that newer text must survive.
        setText((current) => (current.trim() === trimmed ? "" : current));
      })
      .catch(() => {
        failedAttemptRef.current = { text: trimmed, id };
        /* failure already reported by the caller */
      })
      .finally(() => setSending(false));
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
            // AUD-050: `senderHandle` is writable content — attribution is
            // verified against the edit chain's author did (the record's
            // cryptographic writer) via the space's member registry.
            const attributedHandle = resolveAttribution(m);
            const mismatched =
              attributedHandle !== undefined && attributedHandle !== m.senderHandle;
            // A peer writing under the local user's handle renders as
            // theirs, not ours.
            const isOwn = m.senderHandle === currentHandle && !mismatched;
            const verified = Boolean(
              !isOwn && m._editChainValid === true && attributedHandle === m.senderHandle,
            );
            const displayHandle = attributedHandle ?? m.senderHandle;
            return (
              <MessageBubble
                key={m.id}
                message={m}
                isOwn={isOwn}
                senderDisplay={shortHandle(displayHandle, senderHandles)}
                verified={verified}
                // Chain integrity passed but the signature's owner doesn't
                // match the claimed handle — show the warning explicitly
                // rather than a silent green shield.
                spoofed={!isOwn && mismatched}
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
          aria-label="Message"
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
        <ActionIcon
          size="lg"
          variant="filled"
          aria-label="Send message"
          disabled={!text.trim() || sending}
          onClick={handleSend}
        >
          <Send size={16} />
        </ActionIcon>
      </Group>
    </Stack>
  );
}
