import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  ActionIcon,
  Alert,
  Box,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { AlertCircle, Send, Square } from "lucide-react";
import { EmptyState } from "@betterbase/examples-shared";
import type { TransformersJSLanguageModel } from "@browser-ai/transformers-js";
import { LocalChatTransport } from "@/lib/chat-transport";
import { WORKSPACE_HEIGHT } from "@/lib/layout";

const SYSTEM_PROMPT = [
  "You are a helpful assistant running entirely inside the user's web browser.",
  "Be concise and direct, and answer in plain text.",
].join(" ");

/** Concatenated text of a UI message (the foundation renders text parts only). */
function messageText(parts: { type: string; text?: string }[]): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

export function ChatPanel({ model }: { model: TransformersJSLanguageModel }) {
  const [transport] = useState(() => new LocalChatTransport(model, SYSTEM_PROMPT));
  const { messages, sendMessage, status, stop, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);
  // Whether the view is pinned to the bottom; stops the stream from yanking
  // the user back down while they scroll up to reread history.
  const followRef = useRef(true);

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onScroll = () => {
      followRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80;
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, []);

  // Follow the stream: keep the newest message in view as tokens arrive.
  useEffect(() => {
    if (followRef.current) {
      viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight });
    }
  }, [messages]);

  const submit = () => {
    const text = input.trim();
    if (text === "" || busy) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <Box
      style={{
        height: WORKSPACE_HEIGHT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ScrollArea style={{ flex: 1 }} viewportRef={viewportRef}>
        {messages.length === 0 ? (
          <EmptyState
            icon={<Send size={28} />}
            title="Ask the local model"
            description="The model runs on your device — your prompts and the replies never leave this browser."
          />
        ) : (
          <Stack gap={4} py="md" role="log" aria-live="polite" aria-label="Conversation">
            {messages.map((message) => {
              const text = messageText(message.parts);
              if (text === "") return null;
              const isUser = message.role === "user";
              return (
                <Stack key={message.id} gap={2} align={isUser ? "flex-end" : "flex-start"} px="md">
                  {!isUser && (
                    <Text size="xs" c="dimmed" px={4}>
                      Assistant
                    </Text>
                  )}
                  <Paper
                    px="sm"
                    py={6}
                    radius="md"
                    style={{
                      background: isUser
                        ? "var(--mantine-color-blue-6)"
                        : "var(--mantine-color-gray-1)",
                      maxWidth: "75%",
                    }}
                  >
                    <Text
                      size="sm"
                      c={isUser ? "white" : undefined}
                      style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                    >
                      {text}
                    </Text>
                  </Paper>
                </Stack>
              );
            })}
            {status === "submitted" && (
              <Text size="xs" c="dimmed" px="md">
                Thinking…
              </Text>
            )}
          </Stack>
        )}
      </ScrollArea>

      {error !== undefined && (
        <Box px="md" pb="xs">
          <Alert color="red" icon={<AlertCircle size={16} />} title="Generation failed">
            {error.message}
          </Alert>
        </Box>
      )}

      <Group
        px="md"
        py="sm"
        gap="xs"
        style={{ borderTop: "1px solid var(--mantine-color-gray-2)", flexShrink: 0 }}
      >
        <TextInput
          placeholder="Ask anything…"
          aria-label="Message"
          value={input}
          disabled={busy}
          onChange={(event) => setInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            // `isComposing` keeps Enter from sending mid-IME (CJK, Vietnamese).
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          style={{ flex: 1 }}
        />
        {busy ? (
          <ActionIcon size="lg" variant="light" aria-label="Stop generating" onClick={() => stop()}>
            <Square size={14} />
          </ActionIcon>
        ) : (
          <ActionIcon
            size="lg"
            variant="filled"
            aria-label="Send message"
            disabled={input.trim() === ""}
            onClick={submit}
          >
            <Send size={16} />
          </ActionIcon>
        )}
      </Group>
    </Box>
  );
}
