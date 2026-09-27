import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type MessageState,
} from "@assistant-ui/react";
import { Bot, Brain, Check, ChevronDown, Copy, Pencil, RefreshCw, Square } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { useAiChatRuntime } from "@/lib/runtime";
import type { AiChat } from "@/lib/use-ai-chat";
import { WORKSPACE_HEIGHT } from "@/lib/layout";

/** Chat conversations read best in a centered column, not edge to edge. */
const COLUMN_STYLE = {
  width: "100%",
  maxWidth: 768,
  marginInline: "auto",
  paddingInline: 16,
} as const;

/** First-run prompts for an empty chat — one click starts the exchange. */
const SUGGESTIONS = [
  {
    label: "Explain a concept",
    prompt: "Explain how HTTPS keeps traffic private, in plain language.",
  },
  {
    label: "Draft a message",
    prompt: "Draft a friendly email rescheduling tomorrow's meeting to Friday.",
  },
  {
    label: "Plan something",
    prompt: "Plan a 3-day weekend trip to Portland on a modest budget.",
  },
  {
    label: "Think it through",
    prompt: "I have $40 and need dinner for four. Walk me through good options.",
  },
];

interface ChatThreadProps {
  chat: AiChat;
  threadId: string;
}

/**
 * The conversation surface, composed from assistant-ui's thread primitives
 * (Viewport for auto-scroll, MessagePrimitive for part rendering,
 * ViewportFooter for the pinned composer); Mantine does the rendering.
 * The assistant's thinking trace (the model's `<think>` output, split out
 * by the AI SDK's reasoning middleware) collapses behind a "Show thinking"
 * toggle.
 */
export function ChatThread({ chat, threadId }: ChatThreadProps) {
  const runtime = useAiChatRuntime(chat, threadId);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);

  // Show the jump-to-latest button only when the conversation overflows
  // and the user has scrolled away from the bottom. Streaming re-renders
  // re-measure, so new content while pinned never summons the button.
  const updateJump = useCallback(() => {
    const el = viewportRef.current;
    if (el) setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 40);
  }, []);
  useLayoutEffect(updateJump);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateJump, { passive: true });
    window.addEventListener("resize", updateJump);
    return () => {
      el.removeEventListener("scroll", updateJump);
      window.removeEventListener("resize", updateJump);
    };
  }, [updateJump]);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root
        style={{
          height: WORKSPACE_HEIGHT,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <ThreadPrimitive.Viewport
          ref={viewportRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <ThreadPrimitive.Empty>
            <EmptyChat />
          </ThreadPrimitive.Empty>

          <div style={{ ...COLUMN_STYLE, paddingTop: 16, paddingBottom: 8, flex: "0 0 auto" }}>
            <Stack gap={12} role="log" aria-label="Conversation">
              <ThreadPrimitive.Messages>
                {({ message }) =>
                  message.role === "user" ? (
                    <UserMessage key={message.id} chat={chat} message={message} />
                  ) : (
                    <AssistantMessage key={message.id} chat={chat} message={message} />
                  )
                }
              </ThreadPrimitive.Messages>
              {chat.error && (
                <Text size="xs" c="red">
                  {chat.error}
                </Text>
              )}
            </Stack>
          </div>

          {/* Composer rides inside the viewport and stays pinned to the
              bottom while messages scroll underneath it. ViewportFooter only
              measures the inset — the sticky + mt-auto positioning is on us:
              mt-auto pins it down on short threads, sticky on long ones. */}
          <ThreadPrimitive.ViewportFooter
            style={{
              ...COLUMN_STYLE,
              paddingBottom: 16,
              marginTop: "auto",
              position: "sticky",
              bottom: 0,
              zIndex: 1,
              background: "var(--mantine-color-body)",
            }}
          >
            {showJump && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <ThreadPrimitive.ScrollToBottom
                  aria-label="Scroll to bottom"
                  style={{
                    border: "1px solid var(--mantine-color-default-border)",
                    borderRadius: "50%",
                    width: 32,
                    height: 32,
                    display: "grid",
                    placeItems: "center",
                    background: "var(--mantine-color-body)",
                    cursor: "pointer",
                    color: "var(--mantine-color-dimmed)",
                  }}
                >
                  <ChevronDown size={16} />
                </ThreadPrimitive.ScrollToBottom>
              </div>
            )}
            <Composer chat={chat} />
          </ThreadPrimitive.ViewportFooter>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

/** ChatGPT-style landing state for a fresh thread: greeting + prompts. */
function EmptyChat() {
  return (
    <Stack
      align="center"
      justify="center"
      gap="lg"
      px="md"
      // Absorb exactly the space the composer and its padding leave — a
      // fixed height here would push the composer below the fold.
      style={{ flex: "1 1 0%", minHeight: 0 }}
    >
      <ThemeIcon size={56} radius="xl" variant="light" color="indigo" aria-hidden>
        <Bot size={30} />
      </ThemeIcon>
      <Stack gap={4} align="center">
        <Text fw={600} fz="lg">
          How can I help you today?
        </Text>
        <Text size="sm" c="dimmed" ta="center" maw={420}>
          The model runs entirely on this device — prompts and replies never leave your browser, and
          chats sync end-to-end encrypted when you sign in.
        </Text>
      </Stack>
      <Group gap="xs" justify="center" maw={560}>
        {SUGGESTIONS.map((s) => (
          <ThreadPrimitive.Suggestion
            key={s.label}
            prompt={s.prompt}
            send
            style={{
              border: "1px solid var(--mantine-color-default-border)",
              borderRadius: "var(--mantine-radius-md)",
              background: "transparent",
              padding: "6px 12px",
              font: "inherit",
              fontSize: 13,
              cursor: "pointer",
              color: "var(--mantine-color-text)",
            }}
          >
            {s.label}
          </ThreadPrimitive.Suggestion>
        ))}
      </Group>
    </Stack>
  );
}

/** Concatenate a message's text parts (for copy actions). */
function textOf(message: MessageState): string {
  return message.content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Concatenate a message's reasoning parts (for copy actions). */
function reasoningOf(message: MessageState): string {
  return message.content
    .filter((p): p is { type: "reasoning"; text: string } => p.type === "reasoning")
    .map((p) => p.text)
    .join("");
}

const ACTION_ICON_SIZE = { width: 26, height: 26 } as const;

function UserMessage({ chat, message }: { chat: AiChat; message: MessageState }) {
  const streaming = chat.isRunning;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <Stack
      gap={2}
      align="flex-end"
      style={{ alignSelf: "flex-end", width: "auto", maxWidth: "80%" }}
    >
      {editing ? (
        <Paper px="sm" py={6} radius="lg" withBorder w="100%">
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
        </Paper>
      ) : (
        <Paper px="sm" py={6} radius="lg" style={{ background: "var(--mantine-color-blue-6)" }}>
          <MessagePrimitive.Root>
            <MessagePrimitive.Parts
              components={{
                Text: ({ text }) => (
                  <Text
                    component="div"
                    fz="sm"
                    c="white"
                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
                    {text}
                  </Text>
                ),
              }}
            />
          </MessagePrimitive.Root>
        </Paper>
      )}

      {!editing && (
        <Group gap={2}>
          <CopyButton value={textOf(message)} />
          {message.isLast && !streaming && (
            <Tooltip label="Edit & regenerate" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Edit message"
                style={ACTION_ICON_SIZE}
                onClick={() => {
                  setDraft(textOf(message));
                  setEditing(true);
                }}
              >
                <Pencil size={13} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      )}
    </Stack>
  );
}

/**
 * Assistant replies render directly on the page (no bubble), with the
 * thinking trace collapsing behind a toggle. Content renders through
 * MessagePrimitive parts so streaming updates flow in per-part.
 */
function AssistantMessage({ chat, message }: { chat: AiChat; message: MessageState }) {
  const streaming = message.status?.type === "running";
  const empty = textOf(message) === "" && reasoningOf(message) === "";

  return (
    <Stack gap={4} style={{ alignSelf: "flex-start", width: "100%" }}>
      <MessagePrimitive.Root>
        <MessagePrimitive.Parts
          components={{
            Reasoning: ReasoningSlot,
            Text: ({ text }) => <Markdown text={text} />,
          }}
        />
      </MessagePrimitive.Root>
      {empty && streaming && (
        <Text size="sm" c="dimmed">
          Thinking…
        </Text>
      )}
      {!streaming && (
        <Group gap={2}>
          <CopyButton value={textOf(message)} />
          {message.isLast && (
            <Tooltip label="Regenerate" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Regenerate reply"
                style={ACTION_ICON_SIZE}
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

/** Reasoning parts stream in while the model thinks; collapsed by default. */
function ReasoningSlot({ text, status }: { text: string; status?: { type: string } | undefined }) {
  return <ReasoningPanel reasoning={text} streaming={status?.type === "running"} />;
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
        style={ACTION_ICON_SIZE}
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
    <div>
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
    </div>
  );
}

function Composer({ chat }: { chat: AiChat }) {
  return (
    <Paper
      radius="xl"
      withBorder
      style={{ position: "relative", boxShadow: "var(--mantine-shadow-xs)" }}
    >
      <ComposerPrimitive.Root style={{ display: "flex", alignItems: "flex-end" }}>
        <ComposerPrimitive.Input
          minRows={1}
          maxRows={8}
          placeholder="Message the local model…"
          aria-label="Message"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            font: "inherit",
            color: "inherit",
            resize: "none",
            padding: "12px 8px 12px 16px",
          }}
        />
        <div style={{ padding: 6 }}>
          <ThreadPrimitive.If running>
            <Tooltip label="Stop generating" withArrow>
              <ActionIcon
                radius="xl"
                variant="light"
                color="red"
                aria-label="Stop generating"
                onClick={chat.stop}
                style={{ width: 34, height: 34 }}
              >
                <Square size={16} />
              </ActionIcon>
            </Tooltip>
          </ThreadPrimitive.If>
          <ThreadPrimitive.If running={false}>
            <ComposerPrimitive.Send
              aria-label="Send message"
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: "none",
                background: "var(--mantine-color-indigo-6)",
                color: "white",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
              }}
            >
              <ArrowUpSvg />
            </ComposerPrimitive.Send>
          </ThreadPrimitive.If>
        </div>
      </ComposerPrimitive.Root>
    </Paper>
  );
}

function ArrowUpSvg() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}
