import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import type { UIMessage } from "ai";
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
import { Markdown } from "@/components/Markdown";
import type { AiChat } from "@/lib/use-ai-chat";
import { orderPartsForDisplay } from "@/lib/message-parts";
import { parseSummarizedResults } from "@/lib/parallel-search";
import { WORKSPACE_HEIGHT } from "@/lib/layout";

/** A message part, typed loosely: the chat surface only reads type/text fields. */
type Part = { type: string; text?: string };

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
 * The conversation surface, driven by the AI SDK's `useChat` state: each
 * message renders its parts — text as Markdown, the thinking trace behind a
 * "Show thinking" toggle, and tool calls as live tool cards ("Searching the
 * web…" while running, results once available). Mantine does the styling.
 */
export function ChatThread({ chat, onDraftStart }: ChatThreadProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  // Whether the conversation is pinned to the bottom. Auto-follow (below)
  // scrolls only while this is armed; scrolling up disarms it, returning to
  // the bottom re-arms it. Mirrors assistant-ui's Viewport behavior.
  const pinnedRef = useRef(true);

  // The jump button reflects distance-from-bottom on every render.
  // The pinned *state* is only changed by actual scroll events: a render
  // re-measure must not disarm the pin, because streaming grows the
  // content (and thus the distance) before the ResizeObserver below
  // re-pins — a render-time disarm would cancel auto-follow mid-stream.
  const updateJump = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 40;
    setShowJump(!atBottom);
  }, []);
  useLayoutEffect(updateJump);

  // A real scroll (user or programmatic) is the only pin/disarm signal —
  // but only *upward* movement disarms. Scroll events fire frame-aligned,
  // after the component's own re-pin and after interleaved stream commits:
  // a stale measurement against grown content (distance > 40) would
  // otherwise disarm the pin mid-stream. Content growth never moves
  // scrollTop, so "didn't move up" can't be faked by growth.
  const lastTopRef = useRef(0);
  const onScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 40;
    const moved = el.scrollTop - lastTopRef.current;
    lastTopRef.current = el.scrollTop;
    if (atBottom) pinnedRef.current = true;
    else if (moved < -2) pinnedRef.current = false;
    updateJump();
  }, [updateJump]);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateJump);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateJump);
    };
  }, [onScroll, updateJump]);

  const running = chat.status === "submitted" || chat.status === "streaming";

  // Auto-follow: keep the newest content in view while pinned. Streaming
  // grows scrollHeight without moving scrollTop, so without this the reply
  // runs off the bottom of the viewport. Two drivers, both needed: the
  // messages effect re-pins synchronously as parts stream in, and a
  // ResizeObserver catches height changes no dependency captures (late
  // markdown layout, action rows, collapsed sections opening).
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages, running]);
  useEffect(() => {
    const scroller = viewportRef.current;
    const content = contentRef.current;
    if (!scroller || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) scroller.scrollTop = scroller.scrollHeight;
    });
    // The content box for stream growth; the scroller itself for viewport
    // resizes, which change the distance-to-bottom without resizing content.
    observer.observe(content);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // Sending always re-pins and jumps — the outgoing message must land in
  // view even if the user had scrolled up to quote something. Keyed on the
  // message id, not a boolean: after a failed exchange the user message
  // stays last, and a retry send must still jump.
  const lastUserMessageId =
    chat.messages.at(-1)?.role === "user" ? (chat.messages.at(-1)!.id as string) : null;
  useLayoutEffect(() => {
    if (lastUserMessageId === null) return;
    pinnedRef.current = true;
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastUserMessageId]);

  // Switching threads (or first mount) starts at the latest message.
  useLayoutEffect(() => {
    pinnedRef.current = true;
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.activeThread?.id]);

  return (
    <div
      style={{
        height: WORKSPACE_HEIGHT,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        ref={viewportRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {chat.messages.length === 0 && !running && <EmptyChat onSuggestion={(p) => void send(p)} />}

        <div
          ref={contentRef}
          style={{ ...COLUMN_STYLE, paddingTop: 16, paddingBottom: 8, flex: "0 0 auto" }}
        >
          <Stack gap={12} role="log" aria-label="Conversation">
            {chat.messages.map((message, index) =>
              message.role === "user" ? (
                <UserMessage key={message.id} chat={chat} message={message} />
              ) : (
                <AssistantMessage
                  key={message.id}
                  chat={chat}
                  message={message}
                  isLast={index === chat.messages.length - 1}
                  running={running}
                />
              ),
            )}
            {chat.error && (
              <Text size="xs" c="red">
                {chat.error}
              </Text>
            )}
          </Stack>
        </div>

        {/* Composer pinned to the bottom of the viewport while messages
            scroll underneath it. */}
        <div
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
          {/* Floating above the composer, out of the scroll flow: an
              in-flow row would grow scrollHeight on first appear and shove
              the pinned view 40-odd pixels off the bottom. */}
          {showJump && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <Tooltip label="Jump to latest" withArrow>
                <ActionIcon
                  variant="default"
                  radius="xl"
                  aria-label="Scroll to bottom"
                  style={{ width: 32, height: 32 }}
                  // Instant, not smooth: a smooth destination clamps at
                  // call time, so streaming growth during the animation
                  // lands it short — and disarms follow at the same time.
                  onClick={() => viewportRef.current?.scrollTo({ top: 1e9 })}
                >
                  <ChevronDown size={16} />
                </ActionIcon>
              </Tooltip>
            </div>
          )}
          <Composer chat={chat} onDraftStart={onDraftStart} running={running} />
        </div>
      </div>
    </div>
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
          <Text
            component="div"
            fz="sm"
            c="white"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {textOf(message)}
          </Text>
        </Paper>
      )}

      {!editing && (
        <Group gap={2}>
          <CopyButton value={textOf(message)} />
          {/* Edit the most recent user turn (even with replies after it) —
              regenerating drops everything that followed. */}
          {chat.messages.filter((m) => m.role === "user").at(-1) === message &&
            chat.status === "ready" && (
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
    <Stack gap={4} style={{ alignSelf: "flex-start", width: "100%" }}>
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
