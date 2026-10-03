import { useState } from "react";
import {
  ActionIcon,
  Anchor,
  Button,
  Collapse,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive } from "@assistant-ui/react";
import {
  Bot,
  Brain,
  Check,
  ChevronDown,
  Copy,
  Globe,
  Pencil,
  RefreshCw,
  Square,
} from "lucide-react";
import type { UIMessage } from "ai";
import { Markdown } from "@/components/Markdown";
import { orderPartsForDisplay } from "@/lib/message-parts";
import "@/components/chat-thread.css";
import type { AiChat } from "@/lib/use-ai-chat";
import { parseSummarizedResults } from "@/lib/parallel-search";
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
    label: "Search the web",
    prompt: "What are the best noise cancelling headphones right now?",
  },
  {
    label: "Plan something",
    prompt: "Plan a 3-day weekend trip to Portland on a modest budget.",
  },
];

interface ChatThreadProps {
  chat: AiChat;
  /** First send from the New chat draft: creates the thread (returns its id). */
  onDraftStart: (text: string) => Promise<string>;
}

/**
 * The conversation surface. assistant-ui owns the view layer: its runtime
 * (bridged onto the AI SDK's `useChat` in `use-ai-chat`) drives the message
 * list through `ThreadPrimitive`, and its viewport provides the auto-scroll
 * behavior (follow while at the bottom, jump on send/thread switch, a
 * self-hiding jump-to-latest button). Rendering inside the primitives stays
 * Mantine; the composer is custom because the draft flow must create the
 * betterbase thread before the first send reaches the chat.
 */
export function ChatThread({ chat, onDraftStart }: ChatThreadProps) {
  return (
    <AssistantRuntimeProvider runtime={chat.runtime}>
      <ThreadSurface chat={chat} onDraftStart={onDraftStart} />
    </AssistantRuntimeProvider>
  );
}

function ThreadSurface({ chat, onDraftStart }: ChatThreadProps) {
  const running = chat.status === "submitted" || chat.status === "streaming";

  return (
    <ThreadPrimitive.Root
      style={{ height: WORKSPACE_HEIGHT, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <ThreadPrimitive.Viewport
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {chat.messages.length === 0 && !running && <EmptyChat onSuggestion={(p) => void send(p)} />}

        <div style={{ ...COLUMN_STYLE, paddingTop: 16, flex: "1 0 auto" }}>
          <Stack gap={12} role="log" aria-label="Conversation">
            <ThreadPrimitive.Messages>
              {({ message }) => {
                // Runtime message ids are opaque and its content drops
                // step-start markers, so render from the raw UIMessage by
                // thread position: the runtime observes the very same
                // `useChat` list. Part ordering (narration hoisted before
                // its tool call) then uses the same helper as persist
                // time — one ordering rule, live and reloaded.
                const raw = chat.messages[message.index];
                if (!raw || raw.role !== message.role) return null;
                return message.role === "user" ? (
                  <UserMessage key={raw.id} chat={chat} message={raw} />
                ) : (
                  <AssistantMessage
                    key={raw.id}
                    chat={chat}
                    message={raw}
                    isLast={message.isLast}
                    running={running}
                  />
                );
              }}
            </ThreadPrimitive.Messages>
            {chat.error && (
              <Text size="xs" c="red">
                {chat.error}
              </Text>
            )}
          </Stack>
        </div>

        {/* Composer pinned to the bottom of the viewport while messages
            scroll underneath it; the primitive reports its height to the
            viewport's auto-scroll system. */}
        <ThreadPrimitive.ViewportFooter
          style={{
            ...COLUMN_STYLE,
            position: "sticky",
            bottom: 0,
            zIndex: 1,
            background: "var(--mantine-color-body)",
            paddingTop: 8,
            paddingBottom: 16,
          }}
        >
          <div style={{ position: "relative" }}>
            {/* Self-hides while at the bottom; scrolls via the runtime. */}
            <ThreadPrimitive.ScrollToBottom
              className="jump-to-bottom"
              aria-label="Scroll to bottom"
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: "50%",
                transform: "translateX(-50%)",
                width: 32,
                height: 32,
                borderRadius: 16,
                border: "1px solid var(--mantine-color-default-border)",
                background: "var(--mantine-color-body)",
                cursor: "pointer",
              }}
            >
              <ChevronDown size={16} />
            </ThreadPrimitive.ScrollToBottom>
            <Composer chat={chat} onDraftStart={onDraftStart} running={running} />
          </div>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );

  async function send(text: string) {
    if (chat.activeThread === null) await onDraftStart(text);
    else await chat.sendMessage(text);
  }
}

/** ChatGPT-style landing state for a fresh thread: greeting + prompts. */
function EmptyChat({ onSuggestion }: { onSuggestion: (prompt: string) => void }) {
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
          <Button
            key={s.label}
            variant="default"
            size="xs"
            radius="md"
            onClick={() => onSuggestion(s.prompt)}
          >
            {s.label}
          </Button>
        ))}
      </Group>
    </Stack>
  );
}

/** Concatenate a message's text parts (for copy actions). */
function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text?: string }).text ?? "")
    .join("");
}

const ACTION_ICON_SIZE = { width: 26, height: 26 } as const;

function UserMessage({ chat, message }: { chat: AiChat; message: UIMessage }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const text = textOf(message);

  return (
    <MessagePrimitive.Root style={{ alignSelf: "flex-end", width: "auto", maxWidth: "80%" }}>
      <Stack gap={2} align="flex-end">
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
            <Text
              component="div"
              fz="sm"
              c="white"
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            >
              {text}
            </Text>
          </Paper>
        )}

        {!editing && (
          <Group gap={2}>
            <CopyButton value={text} />
            {/* Edit the most recent user turn (even with replies after it) —
                regenerating drops everything that followed. */}
            {chat.messages.filter((m) => m.role === "user").at(-1)?.id === message.id &&
              chat.status === "ready" && (
                <Tooltip label="Edit & regenerate" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Edit message"
                    style={ACTION_ICON_SIZE}
                    onClick={() => {
                      setDraft(text);
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
    </MessagePrimitive.Root>
  );
}

/** A message part, typed loosely: the chat surface only reads type/text fields. */
type Part = { type: string; text?: string };

/**
 * Assistant replies render directly on the page (no bubble): each part
 * streams in as it arrives — reasoning behind a toggle, text as Markdown,
 * tool calls as a live tool card.
 */
function AssistantMessage({
  chat,
  message,
  isLast,
  running,
}: {
  chat: AiChat;
  message: UIMessage;
  isLast: boolean;
  running: boolean;
}) {
  const parts = orderPartsForDisplay(message.parts);
  // `step-start` parts are structural, not content — a tool-only step must
  // still count as content, but a bare step-start must not.
  const hasContent = parts.some((p) => p.type !== "step-start");
  return (
    <MessagePrimitive.Root style={{ width: "100%" }}>
      <Stack gap={4}>
        {parts.map((part, i) => {
          switch (part.type) {
            case "reasoning":
              return (
                <ReasoningSlot
                  key={`${message.id}-reasoning-${i}`}
                  text={part.text ?? ""}
                  streaming={running && isLast && i === message.parts.length - 1}
                />
              );
            case "text":
              return <Markdown key={`${message.id}-text-${i}`} text={part.text} />;
            default:
              if (part.type.startsWith("tool-")) {
                return <ToolCard key={`${message.id}-tool-${i}`} part={part} />;
              }
              return null;
          }
        })}
        {!hasContent && running && isLast && (
          <Text size="sm" c="dimmed">
            Thinking…
          </Text>
        )}
        {!running && isLast && (
          <Group gap={2}>
            <CopyButton value={textOf(message)} />
            <Tooltip label="Regenerate" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Regenerate reply"
                style={ACTION_ICON_SIZE}
                onClick={() => chat.regenerate()}
              >
                <RefreshCw size={13} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Stack>
    </MessagePrimitive.Root>
  );
}

/** One search result, trimmed to a title + one-line excerpt + link. */
function ToolResult({ result }: { result: { title?: string; url?: string; excerpt?: string } }) {
  // The URL comes from a remote server's text output — validate it before
  // touching `new URL` (a malformed value throws and kills the render) and
  // allowlist schemes so nothing like `javascript:` becomes clickable.
  let host: string | null = null;
  if (result.url) {
    try {
      const u = new URL(result.url);
      if (u.protocol === "http:" || u.protocol === "https:") {
        host = u.hostname.replace(/^www\./, "");
      }
    } catch {
      /* fall through: render without a link */
    }
  }
  return (
    <Group gap={6} wrap="nowrap" align="baseline" style={{ minWidth: 0 }}>
      <Text component="div" fz="xs" truncate>
        {result.title ?? result.url ?? "Result"}
      </Text>
      {host && (
        <Anchor
          href={result.url}
          target="_blank"
          rel="noreferrer"
          fz="xs"
          c="dimmed"
          underline="never"
        >
          {host}
        </Anchor>
      )}
      {result.excerpt && (
        <Text component="div" fz="xs" c="dimmed" truncate style={{ flex: 1 }}>
          {result.excerpt}
        </Text>
      )}
    </Group>
  );
}

/** Compact tool chip: what ran, how many results, details on demand. */
function ToolCard({ part }: { part: Part }) {
  const tool = part as {
    type: string;
    state: string;
    input?: { objective?: string; search_queries?: string[] };
    output?: { text?: string } | { error: true; message: string };
  };
  const done = tool.state === "output-available";
  const failed =
    tool.state === "output-error" ||
    (tool.output != null && typeof tool.output === "object" && "error" in tool.output);
  const outputText = done && tool.output && "text" in tool.output ? tool.output.text : undefined;
  const results = outputText ? parseSummarizedResults(outputText) : [];
  const [opened, { toggle }] = useDisclosure(false);
  const label = failed
    ? "Web search failed"
    : done
      ? `Searched the web · ${results.length} result${results.length === 1 ? "" : "s"}`
      : "Searching the web…";

  return (
    <div>
      <UnstyledButton onClick={toggle} fz="xs" c={failed ? "red" : "dimmed"}>
        <Group gap={4}>
          {done || failed ? <Globe size={13} /> : <Loader size={11} />}
          <span>{label}</span>
          {(done || failed) && (
            <ChevronDown
              size={13}
              style={{
                transform: opened ? "rotate(180deg)" : undefined,
                transition: "transform 150ms",
              }}
            />
          )}
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>
        <Stack
          gap={4}
          px="sm"
          py="xs"
          style={{ borderLeft: "2px solid var(--mantine-color-default-border)", minWidth: 0 }}
        >
          {failed ? (
            <Text fz="xs" c="red">
              {tool.output && "error" in tool.output ? tool.output.message : "The search failed."}
            </Text>
          ) : (
            results.slice(0, 4).map((r, i) => <ToolResult key={i} result={r} />)
          )}
          {results.length > 4 && (
            <Text fz="xs" c="dimmed">
              +{results.length - 4} more
            </Text>
          )}
        </Stack>
      </Collapse>
    </div>
  );
}

/** Reasoning parts stream in while the model thinks; collapsed by default. */
function ReasoningSlot({ text, streaming }: { text: string; streaming: boolean }) {
  return <ReasoningPanel reasoning={text} streaming={streaming} />;
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

function Composer({
  chat,
  onDraftStart,
  running,
}: {
  chat: AiChat;
  onDraftStart: (text: string) => Promise<string>;
  running: boolean;
}) {
  const [draft, setDraft] = useState("");

  const submit = async () => {
    const text = draft.trim();
    if (text === "" || running) return;
    setDraft("");
    if (chat.activeThread === null) await onDraftStart(text);
    else await chat.sendMessage(text);
  };

  return (
    <Paper
      radius="xl"
      withBorder
      style={{ position: "relative", boxShadow: "var(--mantine-shadow-xs)" }}
    >
      <div style={{ display: "flex", alignItems: "flex-end" }}>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          minRows={1}
          maxRows={8}
          placeholder="Message the local model…"
          aria-label="Message"
          variant="unstyled"
          style={{ flex: 1, font: "inherit", resize: "none", padding: "12px 8px 12px 16px" }}
          autosize
        />
        <div style={{ padding: 6 }}>
          {running ? (
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
          ) : (
            <Tooltip label="Send message" withArrow>
              <ActionIcon
                radius="xl"
                variant="filled"
                color="indigo"
                aria-label="Send message"
                style={{ width: 34, height: 34 }}
                onClick={() => void submit()}
                disabled={draft.trim() === ""}
              >
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
              </ActionIcon>
            </Tooltip>
          )}
        </div>
      </div>
    </Paper>
  );
}
