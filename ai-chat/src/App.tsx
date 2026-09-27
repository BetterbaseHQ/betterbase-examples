import { useCallback, useEffect, useRef, useState } from "react";
import { Bot } from "lucide-react";
import type { TransformersJSLanguageModel } from "@browser-ai/transformers-js";
import { LessAppShell, useAuth } from "@betterbase/examples-shared";
import { ChatPanel } from "@/components/ChatPanel";
import { ModelSetup, WebGpuRequired } from "@/components/ModelSetup";
import { createChatModel, loadModel, type ChatModelHandle } from "@/lib/model";
import { isWebGpuAvailable } from "@/lib/webgpu";

/**
 * Model lifecycle: idle (explain + load) → loading (progress) → ready (chat).
 * The app has no account or server dependency — auth in the header is only
 * there so the app slots into the examples suite; the chat itself works
 * signed out.
 */
function Workspace() {
  const [model, setModel] = useState<TransformersJSLanguageModel | null>(null);
  const handleRef = useRef<ChatModelHandle | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The worker lives as long as the model; release it on unmount.
  useEffect(() => () => handleRef.current?.dispose(), []);

  const startLoad = useCallback(async () => {
    // A previous attempt may have left a worker (and its partial download)
    // running — terminate it before starting a new one.
    handleRef.current?.dispose();
    handleRef.current = null;
    setLoading(true);
    setError(null);
    setProgress(0);
    try {
      const handle = createChatModel();
      handleRef.current = handle;
      await loadModel(handle.model, setProgress);
      setModel(handle.model);
    } catch (err) {
      handleRef.current?.dispose();
      handleRef.current = null;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  if (!isWebGpuAvailable()) return <WebGpuRequired />;
  if (model !== null) return <ChatPanel model={model} />;
  return <ModelSetup loading={loading} progress={progress} error={error} onLoad={startLoad} />;
}

export default function App() {
  const { isAuthenticated, handle, login, logout } = useAuth();

  return (
    <LessAppShell
      appName="AI Chat"
      appIcon={<Bot size={22} color="var(--mantine-color-indigo-6)" />}
      isAuthenticated={isAuthenticated}
      handle={handle}
      authMode="auth"
      onLogin={login}
      onLogout={logout}
      padding={0}
    >
      <Workspace />
    </LessAppShell>
  );
}
