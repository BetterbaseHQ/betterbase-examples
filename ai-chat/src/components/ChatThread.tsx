import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Collapse,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  unstable_useThreadMessageIds,
  type MessageState,
} from "@assistant-ui/react";
import { Brain, Check, ChevronDown, Copy, Pencil, RefreshCw, Sparkles, Square } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { useAiChatRuntime } from "@/lib/runtime";
import type { AiChat } from "@/lib/use-ai-chat";
import { WORKSPACE_HEIGHT } from "@/lib/layout";

interface ChatThreadProps {
  chat: AiChat;
  threadId: string;
}

/**
 * The conversation surface. assistant-ui owns the runtime (fed from the
 * betterbase db via `useAiChatRuntime`): its primitives drive the message
 * list and composer; rendering is Mantine. Assistant reasoning (the
 * thinking model's `<think>` trace, split out by the AI SDK's reasoning
 * middleware) collapses behind a "Show thinking" toggle.
 */
export function ChatThread({ chat, threadId }: ChatThreadProps) {
  const runtime = useAiChatRuntime(chat, threadId);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root
        style={{
          height: WORKSPACE_HEIGHT,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minHeight: 0,
        }}
      >
        <Messages chat={chat} />
        <Composer chat={chat} />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

/** Concatenate a message's text parts. */
function textOf(message: MessageState): string {
  return message.content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Concatenate a message's reasoning parts. */
function reasoningOf(message: MessageState): string {
  return message.content
    .filter((p): p is { type: "reasoning"; text: string } => p.type === "reasoning")
    .map((p) => p.text)
    .join("");
}

function Messages({ chat }: { chat: AiChat }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const messageCount = useMessageCount();
  // Content growth also drives follow-the-stream: during generation the
  // message count is stable, so the last reply's growing length must scroll.
  const streamedLength = chat.activeMessages
    .slice(-1)
    .reduce((n, m) => n + m.text.length + (m.reasoning?.length ?? 0), 0);

  // Follow the stream: stick to the bottom while the user hasn't scrolled up.
  const stickToBottomRef = useRef(true);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && stickToBottomRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messageCount, streamedLength]);

  const onScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    stickToBottomRef.current =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80;
  };

  return (
    <ScrollArea
      viewportRef={viewportRef}
      onScroll={onScroll}
      h={WORKSPACE_HEIGHT}
      type="auto"
      style={{ flex: 1, minHeight: 0 }}
    >
      <ThreadPrimitive.Empty>
        <Stack align="center" justify="center" h={WORKSPACE_HEIGHT} gap="xs">
          <Sparkles size={28} color="var(--mantine-color-indigo-6)" />
          <Text fw={600}>Ask the local model</Text>
          <Text size="sm" c="dimmed" maw={380} ta="center">
            Runs entirely on your device with the LFM2.5 Thinking model — your chats stay yours and
            sync end-to-end encrypted across your devices.
          </Text>
        </Stack>
      </ThreadPrimitive.Empty>

      <Stack gap={6} py="md" role="log" aria-label="Conversation">
        <ThreadPrimitive.Messages>
          {({ message }) => <MessageBubble chat={chat} message={message} />}
        </ThreadPrimitive.Messages>
        <ThreadPrimitive.If running>
          <Text size="xs" c="dimmed" px="md" aria-live="polite">
            Thinking…
          </Text>
        </ThreadPrimitive.If>
        {chat.error && (
          <Text size="xs" c="red" px="md">
            {chat.error}
          </Text>
        )}
      </Stack>
    </ScrollArea>
  );
}

/** Re-render hook for auto-scroll: subscribes to the thread's message ids. */
function useMessageCount(): number {
  // The runtime exposes the live message-id list; its length drives the
  // scroll-to-bottom effect as messages stream in.
  const ids = unstable_useThreadMessageIds();
  return ids.length;
}

interface MessageBubbleProps {
  chat: AiChat;
  message: MessageState;
}

function MessageBubble({ chat, message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const text = textOf(message);
  const reasoning = reasoningOf(message);
  const streaming = message.status?.type === "running";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <Stack
      gap={2}
      align={isUser ? "flex-end" : "flex-start"}
      px="md"
      w="100%"
      style={{ boxSizing: "border-box" }}
    >
      {!isUser && (
        <Text size="xs" c="dimmed" px={4}>
          Assistant
        </Text>
      )}
      {reasoning !== "" && <ReasoningPanel reasoning={reasoning} streaming={streaming} />}
      <Paper
        px="sm"
        py={6}
        radius="md"
        style={{
          background: isUser ? "var(--mantine-color-blue-6)" : "var(--mantine-color-gray-1)",
          maxWidth: "85%",
        }}
      >
        {isUser ? (
          editing ? (
            <Stack gap="xs">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.currentTarget.value)}
                autosize
                minRows={1}
                data-autofocus
              />
              <Group gap="xs" justify="flex-end">
                <Button variant="subtle" size="compact-xs" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button
                  size="compact-xs"
                  onClick={() => {
                    setEditing(false);
                    void chat.editUserMessage(message.id, draft);
                  }}
                >
                  Save & regenerate
                </Button>
              </Group>
            </Stack>
          ) : (
            <Text fz="sm" c="white" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {text}
            </Text>
          )
        ) : text === "" && streaming ? (
          <Text fz="sm" c="dimmed">
            …
          </Text>
        ) : (
          <Markdown text={text} />
        )}
      </Paper>

      {!editing && (
        <Group gap={2} px={4}>
          <CopyButton value={text} />
          {isUser && message.isLast && !streaming && (
            <Tooltip label="Edit & regenerate" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Edit message"
                onClick={() => {
                  setDraft(text);
                  setEditing(true);
                }}
              >
                <Pencil size={13} />
              </ActionIcon>
            </Tooltip>
          )}
          {!isUser && message.isLast && !streaming && (
            <Tooltip label="Regenerate" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Regenerate reply"
                onClick={() => void chat.regenerate(chat.activeThread?.id ?? "")}
              >
                <RefreshCw size={13} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      )}
    </Stack>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        aria-label="Copy message"
        onClick={() => void copy()}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </ActionIcon>
    </Tooltip>
  );
}

/** Collapsible trace of the thinking model's reasoning. */
function ReasoningPanel({ reasoning, streaming }: { reasoning: string; streaming: boolean }) {
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <Box px={4} w="85%">
      <UnstyledButton onClick={toggle} fz="xs" c="dimmed">
        <Group gap={4}>
          <Brain size={13} />
          <span>{streaming ? "Thinking…" : "Show thinking"}</span>
          <ChevronDown
            size={13}
            style={{
              transform: opened ? "rotate(180deg)" : undefined,
              transition: "transform 150ms",
            }}
          />
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>
        <Text
          size="xs"
          c="dimmed"
          px="sm"
          py="xs"
          style={{
            whiteSpace: "pre-wrap",
            borderLeft: "2px solid var(--mantine-color-default-border)",
            wordBreak: "break-word",
          }}
        >
          {reasoning}
        </Text>
      </Collapse>
    </Box>
  );
}

function Composer({ chat }: { chat: AiChat }) {
  return (
    <Box px="md" pb="md">
      <Paper shadow="xs" withBorder radius="md" px="sm" py="xs">
        <ComposerPrimitive.Root>
          <ComposerPrimitive.Input
            rows={1}
            placeholder="Message the local model…"
            aria-label="Message"
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              font: "inherit",
              color: "inherit",
              resize: "none",
            }}
          />
          <Group justify="flex-end" gap="xs" mt={4}>
            <ThreadPrimitive.If running>
              <Tooltip label="Stop generating" withArrow>
                <ActionIcon
                  variant="light"
                  color="red"
                  aria-label="Stop generating"
                  onClick={chat.stop}
                >
                  <Square size={14} />
                </ActionIcon>
              </Tooltip>
            </ThreadPrimitive.If>
            <ThreadPrimitive.If running={false}>
              <ComposerPrimitive.Send
                aria-label="Send message"
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 6,
                  color: "var(--mantine-color-indigo-6)",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
              </ComposerPrimitive.Send>
            </ThreadPrimitive.If>
          </Group>
        </ComposerPrimitive.Root>
      </Paper>
    </Box>
  );
}
