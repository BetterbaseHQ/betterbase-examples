import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import type { ChatStatus } from "ai";
import type { AssistantRuntime } from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/ai-sdk";
import { deleteTree } from "betterbase/sync";
import { useQuery, useDatabase } from "betterbase/db/react";
import type { TransformersJSLanguageModel } from "@browser-ai/transformers-js";
import {
  threads,
  messages,
  type Message as MessageRecord,
  type Thread as ThreadRecord,
} from "./db";
import { createLocalChatTransport } from "./local-chat-transport";
import { toUIMessage, uiMessageToFields } from "./message-parts";
import { generateThreadTitle, wrapModel } from "./chat-service";
import { UNTITLED, fallbackTitle } from "./titles";

export interface AiChat {
  threads: readonly ThreadRecord[];
  /** False until the query's first emission — gates first-run UI. */
  threadsLoaded: boolean;
  activeThread: ThreadRecord | null;
  /** The live conversation, owned by `useChat` (AI SDK React binding). */
  messages: UIMessage[];
  /** AI SDK chat status: ready | submitted | streaming | error. */
  status: ChatStatus;
  /** Last error for surfacing in the UI (null while healthy). */
  error: string | null;
  /**
   * Draft flow: create the thread titled with the truncated opening
   * message and send the first exchange. Returns the new thread id, or ""
   * when the text is empty and no thread was created.
   */
  startChat: (text: string) => Promise<string>;
  /** Send into the active thread (routes to the draft flow when none). */
  sendMessage: (text: string) => Promise<void>;
  /** assistant-ui runtime over the same `useChat` state (view layer). */
  runtime: AssistantRuntime;
  /** Regenerate the trailing assistant reply (SDK replays the history). */
  regenerate: () => void;
  /** Rewrite a user message and regenerate from there. */
  editUserMessage: (messageId: string, newText: string) => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
  renameThread: (id: string, title: string) => Promise<void>;
  stop: () => void;
}

const isMissingRecordError = (err: unknown) =>
  err instanceof Error && /record (deleted|not found)/i.test(err.message);

/**
 * Domain hook: threads and message history live in the local betterbase
 * database (anonymous when signed out, per-account + synced when signed in).
 * The live conversation runs through the AI SDK's `useChat` with a local
 * `ChatTransport` (in-browser model + tools); the db is written at the
 * exchange boundaries — the user message on send, the assistant reply on
 * finish — and seeds `useChat` when a thread is selected.
 */
export function useAiChat(
  model: TransformersJSLanguageModel,
  activeThreadId: string | null,
  prefilledThink = false,
): AiChat {
  const d = useDatabase();
  const threadResult = useQuery(threads, {
    sort: [
      { field: "lastMessageAt", direction: "desc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allThreads = threadResult?.records ?? [];
  const threadsLoaded = threadResult !== undefined;

  const activeThread = useMemo(
    () => allThreads.find((t) => t.id === activeThreadId) ?? null,
    [allThreads, activeThreadId],
  );

  const msgResult = useQuery(messages, {
    filter: { threadId: activeThreadId ?? "" },
    sort: [
      { field: "sentAt", direction: "asc" },
      { field: "id", direction: "asc" },
    ],
  });
  const activeRecords = useMemo(
    () => msgResult?.records.filter((m) => m.threadId === activeThreadId) ?? [],
    [msgResult, activeThreadId],
  );

  const [error, setError] = useState<string | null>(null);

  const wrappedModel = useMemo(() => wrapModel(model, prefilledThink), [model, prefilledThink]);
  const transport = useMemo(() => createLocalChatTransport(wrappedModel), [wrappedModel]);

  /** The first send of a draft thread, parked until the thread is selected. */
  const pendingDraftRef = useRef<string | null>(null);
  const activeThreadRef = useRef<string | null>(activeThreadId);
  activeThreadRef.current = activeThreadId;
  /** The thread the in-flight exchange belongs to, captured at send time —
   * `onFinish` may fire after the user has switched threads (local models
   * stream for many seconds), and the reply must land in its own thread. */
  const inFlightThreadRef = useRef<string | null>(null);
  /** The assistant db record for the in-flight exchange, written on finish. */
  const pendingAssistantRef = useRef<MessageRecord | null>(null);
  /** The most recently finished assistant record (delete on regenerate). */
  const lastAssistantRecordRef = useRef<MessageRecord | null>(null);
  const firstUserTextRef = useRef<string | null>(null);

  const chat = useChat({
    id: activeThreadId ?? "draft",
    transport,
    onError: (err) => {
      console.error("[chat] error:", err.message);
      setError(err.message);
    },
    onFinish: ({ messages: msgs, isAbort, isError }) => {
      // The exchange's own thread — NOT whichever thread is selected now.
      const threadId = inFlightThreadRef.current;
      inFlightThreadRef.current = null;
      if (threadId === null) return;
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant") return;

      const fields = uiMessageToFields(last);
      console.info(
        `[chat] finish (abort=${isAbort} error=${isError}): ` +
          `${fields.text.length} chars text, ${fields.reasoning?.length ?? 0} chars reasoning`,
      );

      void (async () => {
        try {
          // Persist (or update) the assistant record for this exchange.
          const record = pendingAssistantRef.current;
          let written: MessageRecord;
          if (record) {
            await d.patch(messages, { id: record.id, ...fields });
            written = { ...record, ...fields } as MessageRecord;
          } else {
            written = (await d.put(messages, {
              threadId,
              role: "assistant",
              sentAt: Date.now() + 1,
              ...fields,
            })) as MessageRecord;
          }
          pendingAssistantRef.current = null;
          lastAssistantRecordRef.current = written;

          await d.patch(threads, {
            id: threadId,
            lastMessageText: fields.text,
            lastMessageAt: Date.now(),
          });

          const firstUserText = firstUserTextRef.current;
          firstUserTextRef.current = null;
          if (firstUserText !== null) {
            const provisional = fallbackTitle(firstUserText);
            void (async () => {
              try {
                const title = await generateThreadTitle(wrappedModel, firstUserText, fields.text);
                const t = await d.get(threads, threadId);
                // Replace only the titles we set ourselves (placeholder or
                // provisional) — never a title the user chose meanwhile.
                if (t && (t.title === UNTITLED || t.title === provisional)) {
                  await d.patch(threads, { id: threadId, title });
                }
              } catch {
                /* thread deleted while naming it */
              }
            })();
          }
        } catch (err) {
          if (!isMissingRecordError(err))
            setError(err instanceof Error ? err.message : String(err));
        }
      })();
    },
  });

  // Seed (or reset) the conversation whenever the selected thread changes.
  // The React query for the new thread's records loads asynchronously, so
  // read straight from the db — seeding from this render's snapshot would
  // still hold the previous thread's (or an empty) record list.
  useEffect(() => {
    let cancelled = false;
    const threadId = activeThreadId;
    void (async () => {
      const result =
        threadId === null
          ? undefined
          : await d
              .query(messages, {
                filter: { threadId },
                sort: [
                  { field: "sentAt", direction: "asc" },
                  { field: "id", direction: "asc" },
                ],
              } as never)
              .catch(() => undefined);
      if (cancelled || activeThreadRef.current !== threadId) return;
      const records = ((result as { records?: MessageRecord[] } | undefined)?.records ??
        []) as MessageRecord[];
      pendingAssistantRef.current = null;
      chat.setMessages(records.map(toUIMessage));
      console.info(`[chat] seeded thread ${threadId ?? "draft"} with ${records.length} messages`);
      const draft = pendingDraftRef.current;
      if (draft !== null && threadId !== null) {
        pendingDraftRef.current = null;
        void sendMessageInto(draft);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  const sendMessageInto = useCallback(
    async (text: string) => {
      const threadId = activeThreadRef.current;
      if (threadId === null) return;
      console.info("[chat] send:", text.slice(0, 80));
      const prior = activeRecords.filter((m) => m.threadId === threadId);
      const thread = allThreads.find((t) => t.id === threadId);
      const isFirstExchange = prior.length === 0 || thread?.title === UNTITLED;
      if (isFirstExchange) {
        firstUserTextRef.current = text;
        if (thread?.title === UNTITLED) {
          await d.patch(threads, { id: threadId, title: fallbackTitle(text) });
        }
      }
      // The user message goes to the db immediately (sidebar preview,
      // history seeding on remount). The SDK mints its own UI message id
      // (put returns the db record); edit/regenerate reconcile by position.
      await d.put(messages, { threadId, role: "user", text, sentAt: Date.now() });
      inFlightThreadRef.current = threadId;
      pendingAssistantRef.current = null;
      setError(null);
      chat.sendMessage({ text });
    },
    [d, activeRecords, allThreads, chat],
  );

  // assistant-ui view layer: the runtime observes the very same `useChat`
  // state (no separate copy) and powers the Thread/Message primitives in
  // ChatThread.
  const runtime = useAISDKRuntime(chat);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed === "" || activeThreadRef.current === null) return;
      try {
        await sendMessageInto(trimmed);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [sendMessageInto],
  );

  const startChat = useCallback(
    async (text: string): Promise<string> => {
      const trimmed = text.trim();
      if (trimmed === "") return "";
      const record = await d.put(threads, {
        title: fallbackTitle(trimmed),
        lastMessageText: "",
        lastMessageAt: Date.now(),
      });
      // Park the first send: it fires from the seeding effect once the
      // caller (App) selects the freshly created thread.
      pendingDraftRef.current = trimmed;
      firstUserTextRef.current = trimmed;
      console.info(`[chat] draft thread ${record.id} created`);
      return record.id;
    },
    [d],
  );

  const deleteThread = useCallback(
    async (id: string) => {
      // Only the active thread's chat can be stopped from this hook; a
      // background-streaming chat for another thread keeps running, but its
      // reply persists into its own thread (inFlightThreadRef), not this one.
      if (id === activeThreadRef.current) chat.stop();
      // deleteTree cascades the thread's messages along the declared
      // parent edge (a plain delete would orphan — and keep syncing — them).
      await deleteTree(d, threads, id);
    },
    [d, chat],
  );

  const renameThread = useCallback(
    async (id: string, title: string) => {
      await d.patch(threads, { id, title });
    },
    [d],
  );

  const regenerate = useCallback(() => {
    console.info("[chat] regenerate");
    const threadId = activeThreadRef.current;
    if (threadId === null) return;
    // Drop the trailing assistant record; onFinish writes a fresh one.
    // Prefer the record the last finish actually wrote — the query
    // snapshot can lag it by a tick (duplicate-reply race on fast clicks).
    const finished = lastAssistantRecordRef.current;
    const records = activeRecords.filter((m) => m.threadId === threadId);
    const last = records[records.length - 1];
    const target =
      finished && finished.threadId === threadId
        ? finished
        : last?.role === "assistant"
          ? last
          : undefined;
    if (target) {
      void d.delete(messages, target.id).catch(() => {});
    }
    lastAssistantRecordRef.current = null;
    inFlightThreadRef.current = threadId;
    pendingAssistantRef.current = null;
    firstUserTextRef.current = null;
    setError(null);
    chat.regenerate();
  }, [d, activeRecords, chat]);

  const editUserMessage = useCallback(
    async (messageId: string, newText: string) => {
      const trimmed = newText.trim();
      if (trimmed === "") return;
      const threadId = activeThreadRef.current;
      if (threadId === null) return;
      // Read the records straight from the db — the query snapshot can lag
      // the just-finished exchange, which would leave a stale trailing
      // reply behind after the edit.
      const result = await d
        .query(messages, {
          filter: { threadId },
          sort: [
            { field: "sentAt", direction: "asc" },
            { field: "id", direction: "asc" },
          ],
        } as never)
        .catch(() => undefined);
      const ordered = (
        ((result as { records?: MessageRecord[] } | undefined)?.records ?? []) as MessageRecord[]
      ).filter((m) => m.threadId === threadId);
      // UI messages and db records line up 1:1 after each finished
      // exchange; the edit target is the db record at the same position.
      const index = chat.messages.findIndex((m) => m.id === messageId);
      const target = index >= 0 ? ordered[index] : undefined;
      if (!target || target.role !== "user") return;

      // Drop everything after the edited message, rewrite it, then replay
      // the history in useChat and send the new text.
      await d.bulkDelete(
        messages,
        ordered.slice(index + 1).map((m) => m.id),
      );
      // Patch the db record (its id differs from the UI message id).
      await d.patch(messages, { id: target.id, text: trimmed });
      lastAssistantRecordRef.current = null;
      inFlightThreadRef.current = threadId;
      pendingAssistantRef.current = null;
      setError(null);
      chat.setMessages(ordered.slice(0, index).map(toUIMessage));
      console.info("[chat] edit user message, regenerate from there");
      chat.sendMessage({ text: trimmed });
    },
    [d, chat],
  );

  return {
    threads: allThreads,
    threadsLoaded,
    activeThread,
    messages: chat.messages,
    status: chat.status,
    error,
    runtime,
    startChat,
    sendMessage,
    regenerate,
    editUserMessage,
    deleteThread,
    renameThread,
    stop: chat.stop,
  };
}
