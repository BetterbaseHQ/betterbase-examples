import { useExternalStoreRuntime, type ThreadMessageLike } from "@assistant-ui/react";
import type { AiChat } from "./use-ai-chat";
import type { Message } from "./db";

/** Map a db message record to assistant-ui's message shape. */
function toThreadMessage(m: Message): ThreadMessageLike {
  const content: ThreadMessageLike["content"] = [];
  if (typeof m.reasoning === "string" && m.reasoning !== "") {
    (content as { type: "reasoning"; text: string }[]).push({
      type: "reasoning",
      text: m.reasoning,
    });
  }
  (content as { type: "text"; text: string }[]).push({
    type: "text",
    text: m.text,
  });
  return { id: m.id, role: m.role, content };
}

/**
 * Bridge the betterbase-backed chat state into assistant-ui. The database
 * stays the source of truth: messages map in as an external store and
 * `onNew`/`onCancel` run the local model.
 */
export function useAiChatRuntime(chat: AiChat, activeThreadId: string | null) {
  return useExternalStoreRuntime({
    isRunning: chat.isRunning,
    messages: chat.activeMessages.map(toThreadMessage),
    convertMessage: (m: ThreadMessageLike) => m,
    onNew: async (message) => {
      if (activeThreadId === null) return;
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content
              .filter((p) => p.type === "text")
              .map((p) => (p as { type: "text"; text: string }).text)
              .join("");
      await chat.sendMessage(activeThreadId, text);
    },
    onCancel: async () => {
      chat.stop();
    },
  });
}
