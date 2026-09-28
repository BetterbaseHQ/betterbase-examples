import { useCallback, useEffect, useRef, useState } from "react";
import { Text } from "@mantine/core";
import { Bot } from "lucide-react";
import type { TransformersJSLanguageModel } from "@browser-ai/transformers-js";
import { LessAppShell, ScopedAppTree, useAuth } from "@betterbase/examples-shared";
import { useConnectionStatus, useSync } from "betterbase/sync/react";
import { ThreadSidebar } from "@/components/ThreadSidebar";
import { ChatThread } from "@/components/ChatThread";
import { ModelSetup, WebGpuRequired } from "@/components/ModelSetup";
import {
  MODELS,
  clearModelReady,
  createChatModel,
  getModel,
  isModelReady,
  loadModel,
  markModelReady,
  selectedModelId,
  setSelectedModelId,
  type ChatModelHandle,
  type ModelInfo,
} from "@/lib/model";
import { isWebGpuAvailable } from "@/lib/webgpu";
import {
  DB_NAME,
  currentScopeDbName,
  db,
  deleteAnonymousDatabase,
  messages,
  openDatabaseForScope,
  threads,
} from "@/lib/db";
import { useAiChat, useWrappedModel } from "@/lib/use-ai-chat";

const createFilesWorker = () =>
  new Worker(new URL("./lib/files-worker.ts", import.meta.url), {
    type: "module",
  });

/**
 * Model lifecycle: idle (pick + explain + load) → loading (progress) →
 * ready (chat). The model loads once per tab and stays warm across thread
 * and account switches — only the chat UI re-mounts. The handle's lifetime
 * is owned by `App` (via `onReady`): disposing here on unmount would
 * terminate the inference worker the moment the gate is replaced by the
 * workspace.
 *
 * When the picked model's weights are already cached (per-model flag in
 * localStorage), the load starts automatically — a warm load is quick and
 * needs no consent, so returning users never see the download pitch again.
 */
function ModelGate({
  info,
  autoStart,
  onReady,
  onSelect,
}: {
  info: ModelInfo;
  autoStart: boolean;
  onReady: (model: TransformersJSLanguageModel, handle: ChatModelHandle) => void;
  onSelect: (id: string) => void;
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
      const handle = createChatModel(info, (reason) => rejectOnWorkerError?.(reason));
      handleRef.current = handle;
      await Promise.race([loadModel(handle.model, setProgress), workerFailed]);
      markModelReady(info.id);
      onReady(handle.model, handle);
    } catch (err) {
      clearModelReady(info.id);
      handleRef.current?.dispose();
      handleRef.current = null;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [info, onReady]);

  // Picking a different model resets any attempt; the auto-start guard
  // re-arms when `autoStart` clears so a later re-selection can auto-run.
  const startedRef = useRef(false);
  useEffect(() => {
    setError(null);
    setProgress(0);
    startedRef.current = false;
  }, [info.id]);

  // Jump straight into a warm load; the first-ever load keeps its explicit
  // download button (a multi-GB fetch deserves consent). The guard keeps a
  // WebGPU-less browser from spawning a doomed worker.
  useEffect(() => {
    if (!autoStart || startedRef.current || !isWebGpuAvailable()) return;
    startedRef.current = true;
    void startLoad();
  }, [autoStart, startLoad]);

  if (!isWebGpuAvailable()) return <WebGpuRequired />;
  return (
    <ModelSetup
      models={MODELS}
      selectedId={info.id}
      onSelect={onSelect}
      loading={loading}
      progress={progress}
      error={error}
      // A failed warm load usually means the cache was evicted — the retry
      // is a full download again, so drop the warm copy once an error shows.
      warm={autoStart && error === null}
      onLoad={startLoad}
    />
  );
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
  modelLabel,
  signedIn,
  onChangeModel,
}: {
  model: TransformersJSLanguageModel;
  modelLabel: string;
  signedIn: boolean;
  onChangeModel: () => void;
}) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const wrappedModel = useWrappedModel(model);

  // Null means the persistent "New chat" draft is selected — the app always
  // opens there, and nothing is created in the database until the first
  // send names the thread (see `startChat`).
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const chat = useAiChat(wrappedModel, activeThreadId);

  // The db query emits after `startChat` resolves, so a just-selected id
  // is briefly absent from `chat.threads` — grace-period it until the
  // query confirms, then treat any truly-gone id as the draft.
  const pendingSelectRef = useRef<string | null>(null);

  // Keep the selection valid when threads disappear (delete / sync); a
  // dangling id falls back to the New chat draft — always a safe landing.
  useEffect(() => {
    if (chat.activeThread?.id === activeThreadId) {
      pendingSelectRef.current = null;
      return;
    }
    if (
      activeThreadId !== null &&
      chat.activeThread === null &&
      pendingSelectRef.current !== activeThreadId
    ) {
      setActiveThreadId(null);
    }
  }, [activeThreadId, chat.activeThread]);

  const startNewChat = useCallback(
    async (text: string) => {
      const id = await chat.startChat(text);
      if (id !== "") {
        pendingSelectRef.current = id;
        setActiveThreadId(id);
      }
      return id;
    },
    [chat],
  );

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
          onNewChat={() => setActiveThreadId(null)}
          onRename={(id, title) => void chat.renameThread(id, title)}
          onDelete={(id) => void deleteThread(id)}
          modelLabel={modelLabel}
          onChangeModel={onChangeModel}
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
      <ChatThread chat={chat} onDraftStart={startNewChat} />
    </LessAppShell>
  );
}

export default function App() {
  const [modelId, setModelId] = useState(selectedModelId);
  const [autoStart, setAutoStart] = useState(() => isModelReady(selectedModelId()));
  const [model, setModel] = useState<TransformersJSLanguageModel | null>(null);
  const handleRef = useRef<ChatModelHandle | null>(null);

  // The worker lives for the tab: it stays warm across thread and account
  // switches and is terminated only when the app unmounts.
  useEffect(() => () => handleRef.current?.dispose(), []);

  const handleReady = useCallback((m: TransformersJSLanguageModel, handle: ChatModelHandle) => {
    handleRef.current = handle;
    setModel(m);
  }, []);

  const selectModel = useCallback((id: string) => {
    setSelectedModelId(id);
    setModelId(id);
    setAutoStart(isModelReady(id));
  }, []);

  // Back to the picker; autoStart stays off so the currently-loaded model
  // doesn't immediately re-load — the user asked to switch.
  const changeModel = useCallback(() => {
    handleRef.current?.dispose();
    handleRef.current = null;
    setModel(null);
    setAutoStart(false);
  }, []);

  const info = getModel(modelId);

  if (model === null) {
    return (
      <ModelGate info={info} autoStart={autoStart} onReady={handleReady} onSelect={selectModel} />
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
      local={
        <AiChatWorkspace
          model={model}
          modelLabel={info.label}
          signedIn={false}
          onChangeModel={changeModel}
        />
      }
    >
      {() => (
        <AiChatWorkspace
          model={model}
          modelLabel={info.label}
          signedIn
          onChangeModel={changeModel}
        />
      )}
    </ScopedAppTree>
  );
}
