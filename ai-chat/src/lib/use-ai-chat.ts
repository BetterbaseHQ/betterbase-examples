import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteTree } from "betterbase/sync";
import { useQuery, useDatabase } from "betterbase/db/react";
import type { ModelMessage } from "ai";
import type { LanguageModel } from "ai";
import type { TransformersJSLanguageModel } from "@browser-ai/transformers-js";
import {
  threads,
  messages,
  type Message as MessageRecord,
  type Thread as ThreadRecord,
} from "./db";
import {
  generateThreadTitle,
  isAbortError,
  streamReply,
  wrapModel,
  type ReplyState,
} from "./chat-service";
import { UNTITLED, fallbackTitle } from "./titles";

/** Minimum ms between db writes while streaming tokens into a message. */
const STREAM_WRITE_INTERVAL_MS = 120;

export interface AiChat {
  threads: readonly ThreadRecord[];
  /** False until the query's first emission — gates first-run UI. */
  threadsLoaded: boolean;
  /** Messages of the active thread (empty when none selected). */
  activeMessages: readonly MessageRecord[];
  activeThread: ThreadRecord | null;
  /** A reply is currently streaming into the active thread. */
  isRunning: boolean;
  /** Last error for surfacing in the UI (null while healthy). */
  error: string | null;
  /**
   * Draft flow: create the thread titled with the truncated opening
   * message and kick off the first exchange (not awaited — failures
   * surface through `error`). Returns the new thread id, or "" when the
   * text is empty and no thread was created.
   */
  startChat: (text: string) => Promise<string>;
  deleteThread: (id: string) => Promise<void>;
  renameThread: (id: string, title: string) => Promise<void>;
  sendMessage: (threadId: string, text: string) => Promise<void>;
  /** Delete the trailing assistant reply and regenerate it. */
  regenerate: (threadId: string) => Promise<void>;
  /** Rewrite a user message and regenerate from there. */
  editUserMessage: (messageId: string, newText: string) => Promise<void>;
  stop: () => void;
}

const isMissingRecordError = (err: unknown) =>
  err instanceof Error && /record (deleted|not found)/i.test(err.message);

/**
 * Domain hook: threads and messages live in the local betterbase database
 * (anonymous when signed out, per-account + synced when signed in); local
 * mutations auto-sync via SyncEngine's change listener. Inference runs on
 * the in-browser model and streams into the assistant message record.
 */
export function useAiChat(model: LanguageModel, activeThreadId: string | null): AiChat {
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
  const activeMessages = useMemo(
    () => msgResult?.records.filter((m) => m.threadId === activeThreadId) ?? [],
    [msgResult, activeThreadId],
  );

  /** The thread a reply is streaming into, or null when idle. */
  const [runningThreadId, setRunningThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scope swaps remount this hook (new database underneath): stop writing
  // into the superseded db instead of racing its retirement.
  useEffect(() => () => abortRef.current?.abort(), []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** Surface db failures instead of dropping them as unhandled rejections. */
  const fail = useCallback((err: unknown) => {
    setError(err instanceof Error ? err.message : String(err));
  }, []);

  /**
   * Field-level patch (merge-safe with concurrent peer edits from sync).
   * A record deleted mid-stream (thread deleted while a reply streams)
   * rejects — that's not an error, the write is just moot.
   */
  const patchMessage = useCallback(
    async (id: string, fields: Partial<MessageRecord>) => {
      try {
        await d.patch(messages, { id, ...fields });
      } catch (err) {
        if (!isMissingRecordError(err)) fail(err);
      }
    },
    [d, fail],
  );

  const patchThread = useCallback(
    async (id: string, fields: Partial<ThreadRecord>) => {
      try {
        await d.patch(threads, { id, ...fields });
      } catch (err) {
        if (!isMissingRecordError(err)) fail(err);
      }
    },
    [d, fail],
  );

  const deleteThread = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      // deleteTree cascades the thread's messages along the declared
      // parent edge (a plain delete would orphan — and keep syncing — them).
      await deleteTree(d, threads, id);
    },
    [d],
  );

  const renameThread = useCallback(
    async (id: string, title: string) => {
      await patchThread(id, { title });
    },
    [patchThread],
  );

  /**
   * Run one assistant turn: stream into the placeholder message record,
   * then update the thread's preview. Titles the thread after its first
   * exchange. Reasoning deltas are throttled into the record — the db is
   * the source of truth for rendering.
   */
  const runAssistantReply = useCallback(
    async (
      threadId: string,
      history: ModelMessage[],
      assistantRecord: MessageRecord,
      firstUserText: string | null,
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setRunningThreadId(threadId);
      setError(null);

      let lastWrite = 0;
      const persist = (state: ReplyState, force = false) => {
        const now = performance.now();
        if (!force && now - lastWrite < STREAM_WRITE_INTERVAL_MS) return;
        lastWrite = now;
        void patchMessage(assistantRecord.id, {
          text: state.text,
          ...(state.reasoning ? { reasoning: state.reasoning } : {}),
        });
      };

      const { state: finalState, error: streamError } = await streamReply(model, history, {
        signal: controller.signal,
        onUpdate: (state) => persist(state),
      });
      abortRef.current = null;
      setRunningThreadId((current) => (current === threadId ? null : current));

      if (streamError !== null && !isAbortError(streamError)) {
        setError(streamError instanceof Error ? streamError.message : String(streamError));
      }

      // Final write is forced and authoritative: whatever streamed — possibly
      // partial after an abort/error — is what the record holds.
      persist(finalState, true);

      const replyText = finalState.text;
      await patchThread(threadId, {
        lastMessageText: replyText,
        lastMessageAt: Date.now(),
      });

      if (firstUserText !== null) {
        const provisional = fallbackTitle(firstUserText);
        void (async () => {
          try {
            const title = await generateThreadTitle(model, firstUserText, replyText);
            const t = await d.get(threads, threadId);
            // Replace only the titles we set ourselves (placeholder or
            // provisional) — never a title the user chose meanwhile.
            if (t && (t.title === UNTITLED || t.title === provisional)) {
              await patchThread(threadId, { title });
            }
          } catch {
            /* thread deleted while naming it */
          }
        })();
      }
    },
    [d, model, patchMessage, patchThread],
  );

  const sendMessage = useCallback(
    async (threadId: string, text: string) => {
      const trimmed = text.trim();
      if (trimmed === "") return;
      try {
        const prior = (msgResult?.records ?? []).filter((m) => m.threadId === threadId);
        const history: ModelMessage[] = [
          ...prior.map((m) => ({ role: m.role, content: m.text }) as ModelMessage),
          { role: "user", content: trimmed },
        ];

        const now = Date.now();
        await d.put(messages, {
          threadId,
          role: "user",
          text: trimmed,
          sentAt: now,
        });
        const assistant = await d.put(messages, {
          threadId,
          role: "assistant",
          text: "",
          sentAt: now + 1,
        });

        const thread = allThreads.find((t) => t.id === threadId);
        const isFirstExchange = prior.length === 0 || thread?.title === UNTITLED;
        // Legacy untitled threads (created by older builds) get the same
        // provisional title as draft-born threads.
        if (isFirstExchange && thread?.title === UNTITLED) {
          await patchThread(threadId, { title: fallbackTitle(trimmed) });
        }
        await runAssistantReply(threadId, history, assistant, isFirstExchange ? trimmed : null);
      } catch (err) {
        fail(err);
      }
    },
    [d, msgResult, allThreads, runAssistantReply, fail],
  );

  /**
   * Draft flow: nothing exists until the first send. The thread is born
   * titled with the truncated opening message (the sidebar shows it
   * immediately); the model replaces that provisional title after the
   * reply completes — see the naming block in `runAssistantReply`.
   *
   * Returns without awaiting the exchange: the caller selects the thread
   * right away so messages and the Stop control appear while the model
   * runs. Streaming failures surface through `error`.
   */
  const startChat = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed === "") return "";
      const record = await d.put(threads, {
        title: fallbackTitle(trimmed),
        lastMessageText: "",
        lastMessageAt: Date.now(),
      });
      void sendMessage(record.id, trimmed);
      return record.id;
    },
    [d, sendMessage],
  );

  const regenerate = useCallback(
    async (threadId: string) => {
      try {
        const threadMsgs = (msgResult?.records ?? [])
          .filter((m) => m.threadId === threadId)
          .slice()
          .sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id));
        const last = threadMsgs[threadMsgs.length - 1];
        if (!last || last.role !== "assistant") return;
        await d.delete(messages, last.id);
        const history: ModelMessage[] = threadMsgs
          .slice(0, -1)
          .map((m) => ({ role: m.role, content: m.text }) as ModelMessage);
        const assistant = await d.put(messages, {
          threadId,
          role: "assistant",
          text: "",
          sentAt: Date.now(),
        });
        await runAssistantReply(threadId, history, assistant, null);
      } catch (err) {
        fail(err);
      }
    },
    [d, msgResult, runAssistantReply, fail],
  );

  const editUserMessage = useCallback(
    async (messageId: string, newText: string) => {
      const trimmed = newText.trim();
      if (trimmed === "") return;
      try {
        const all = msgResult?.records ?? [];
        const target = all.find((m) => m.id === messageId);
        if (!target || target.role !== "user") return;

        const ordered = all
          .filter((m) => m.threadId === target.threadId)
          .slice()
          .sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id));
        const index = ordered.findIndex((m) => m.id === messageId);

        // Drop everything after the edited message, then rewrite it.
        await d.bulkDelete(
          messages,
          ordered.slice(index + 1).map((m) => m.id),
        );
        await patchMessage(messageId, { text: trimmed });

        const history: ModelMessage[] = [
          ...ordered
            .slice(0, index)
            .map((m) => ({ role: m.role, content: m.text }) as ModelMessage),
          { role: "user", content: trimmed },
        ];
        const assistant = await d.put(messages, {
          threadId: target.threadId,
          role: "assistant",
          text: "",
          sentAt: Date.now(),
        });
        await runAssistantReply(target.threadId, history, assistant, null);
      } catch (err) {
        fail(err);
      }
    },
    [d, msgResult, runAssistantReply, patchMessage, fail],
  );

  return {
    threads: allThreads,
    threadsLoaded,
    activeMessages,
    activeThread,
    isRunning: runningThreadId !== null && runningThreadId === activeThreadId,
    error,
    startChat,
    deleteThread,
    renameThread,
    sendMessage,
    regenerate,
    editUserMessage,
    stop,
  };
}

/** Wrap once per model instance (the reasoning middleware is stateless). */
export function useWrappedModel(raw: TransformersJSLanguageModel): LanguageModel {
  return useMemo(() => wrapModel(raw), [raw]);
}
