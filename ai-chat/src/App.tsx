import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text } from "@mantine/core";
import { Bot } from "lucide-react";
import type { TransformersJSLanguageModel } from "@browser-ai/transformers-js";
import { EmptyState, LessAppShell, ScopedAppTree, useAuth } from "@betterbase/examples-shared";
import { useConnectionStatus, useSync } from "betterbase/sync/react";
import { ThreadSidebar } from "@/components/ThreadSidebar";
import { ChatThread } from "@/components/ChatThread";
import { ModelSetup, WebGpuRequired } from "@/components/ModelSetup";
import { createChatModel, loadModel, type ChatModelHandle } from "@/lib/model";
import { isWebGpuAvailable } from "@/lib/webgpu";
import { WORKSPACE_HEIGHT } from "@/lib/layout";
import {
  DB_NAME,
  currentScopeDbName,
  db,
  deleteAnonymousDatabase,
  messages,
  openDatabaseForScope,
  threads,
} from "@/lib/db";
import { useAiChat, useThinkingModel } from "@/lib/use-ai-chat";

const createFilesWorker = () =>
  new Worker(new URL("./lib/files-worker.ts", import.meta.url), {
    type: "module",
  });

/**
 * Model lifecycle: idle (explain + load) → loading (progress) → ready (chat).
 * The model loads once per tab and stays warm across thread and account
 * switches — only the chat UI re-mounts. The handle's lifetime is owned by
 * `App` (via `onReady`): disposing here on unmount would terminate the
 * inference worker the moment the gate is replaced by the workspace.
 */
function ModelGate({
  onReady,
}: {
  onReady: (model: TransformersJSLanguageModel, handle: ChatModelHandle) => void;
}) {
  const handleRef = useRef<ChatModelHandle | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startLoad = useCallback(async () => {
    // A previous attempt may have left a worker (and its partial download)
    // running — terminate it before starting a new one.
    handleRef.current?.dispose();
    handleRef.current = null;
    setLoading(true);
    setError(null);
    setProgress(0);
    try {
      // Race the load against a worker that never starts (script-load
      // failure, CSP block): the provider only settles on worker messages,
      // so `loadModel` alone would hang forever in that case.
      let rejectOnWorkerError: ((reason: unknown) => void) | undefined;
      const workerFailed = new Promise<never>((_, reject) => {
        rejectOnWorkerError = reject;
      });
      const handle = createChatModel((reason) => rejectOnWorkerError?.(reason));
      handleRef.current = handle;
      await Promise.race([loadModel(handle.model, setProgress), workerFailed]);
      onReady(handle.model, handle);
    } catch (err) {
      handleRef.current?.dispose();
      handleRef.current = null;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onReady]);

  if (!isWebGpuAvailable()) return <WebGpuRequired />;
  return <ModelSetup loading={loading} progress={progress} error={error} onLoad={startLoad} />;
}

/** Sync status banner — only mounted inside BetterbaseProvider (signed in). */
function SyncBanner() {
  const { error: syncError } = useSync();
  const status = useConnectionStatus();
  if (syncError === undefined && status !== "offline") return null;
  return (
    <Text size="xs" c={syncError !== undefined ? "red" : "dimmed"} px="md" pt="xs">
      {syncError !== undefined
        ? `Sync error: ${String(syncError)}`
        : "Offline — chats still work; sync resumes on reconnect."}
    </Text>
  );
}

/**
 * The chat workspace for one database scope (anonymous or signed-in —
 * `signedIn` only toggles the sync banner and first-run copy). Threads and
 * messages live in the local database; signing in swaps the database
 * underneath and syncs it end-to-end encrypted.
 */
function AiChatWorkspace({
  model,
  signedIn,
}: {
  model: TransformersJSLanguageModel;
  signedIn: boolean;
}) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const wrappedModel = useThinkingModel(model);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const chat = useAiChat(wrappedModel, activeThreadId);

  // Select the newest thread once the first query emission lands.
  useEffect(() => {
    if (activeThreadId === null && chat.threads.length > 0) {
      setActiveThreadId(chat.threads[0]!.id);
    }
  }, [activeThreadId, chat.threads]);

  // Keep the selection valid when threads disappear (delete / sync).
  useEffect(() => {
    if (activeThreadId !== null && chat.activeThread === null && chat.threads.length > 0) {
      setActiveThreadId(chat.threads[0]!.id);
    }
  }, [activeThreadId, chat.activeThread, chat.threads]);

  const createThread = useCallback(async () => {
    setActiveThreadId(await chat.createThread());
  }, [chat]);

  const deleteThread = useCallback(
    async (id: string) => {
      await chat.deleteThread(id);
      if (id === activeThreadId) setActiveThreadId(null);
    },
    [chat, activeThreadId],
  );

  return (
    <LessAppShell
      appName="AI Chat"
      appIcon={<Bot size={22} color="var(--mantine-color-indigo-6)" />}
      navbar={
        <ThreadSidebar
          threads={chat.threads}
          selectedId={activeThreadId}
          loaded={chat.threadsLoaded}
          onSelect={setActiveThreadId}
          onCreate={() => void createThread()}
          onRename={(id, title) => void chat.renameThread(id, title)}
          onDelete={(id) => void deleteThread(id)}
        />
      }
      navbarWidth={280}
      isAuthenticated={isAuthenticated}
      handle={handle}
      authMode="auth"
      onLogin={login}
      onLogout={logout}
      padding={0}
    >
      {signedIn && <SyncBanner />}
      {activeThreadId !== null && chat.activeThread !== null ? (
        <ChatThread chat={chat} threadId={activeThreadId} />
      ) : chat.threadsLoaded && chat.threads.length === 0 ? (
        <EmptyState
          icon={<Bot size={32} />}
          title="No chats yet"
          description={
            signedIn
              ? "Start a chat — it syncs end-to-end encrypted to your other devices."
              : "Start a chat — it stays on this device until you sign in."
          }
        />
      ) : (
        <Box style={{ height: WORKSPACE_HEIGHT, display: "grid", placeItems: "center" }}>
          <Text size="sm" c="dimmed">
            Select a chat or start a new one.
          </Text>
        </Box>
      )}
    </LessAppShell>
  );
}

export default function App() {
  const [model, setModel] = useState<TransformersJSLanguageModel | null>(null);
  const handleRef = useRef<ChatModelHandle | null>(null);

  // The worker lives for the tab: it stays warm across thread and account
  // switches and is terminated only when the app unmounts.
  useEffect(() => () => handleRef.current?.dispose(), []);

  if (model === null) {
    return (
      <ModelGate
        onReady={(m, handle) => {
          handleRef.current = handle;
          setModel(m);
        }}
      />
    );
  }

  return (
    <ScopedAppTree
      appName={DB_NAME}
      collections={[threads, messages]}
      openDatabaseForScope={openDatabaseForScope}
      deleteAnonymousDatabase={deleteAnonymousDatabase}
      getDb={() => db}
      createFilesWorker={createFilesWorker}
      getCurrentScopeDbName={currentScopeDbName}
      local={<AiChatWorkspace model={model} signedIn={false} />}
    >
      {() => <AiChatWorkspace model={model} signedIn />}
    </ScopedAppTree>
  );
}
