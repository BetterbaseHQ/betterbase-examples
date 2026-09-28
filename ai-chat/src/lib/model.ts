import { transformersJS, type TransformersJSLanguageModel } from "@browser-ai/transformers-js";

/**
 * The downloadable models. All three ship WebGPU `q4f16` ONNX exports from
 * LiquidAI; sizes are the q4f16 shard totals (verified against the HF repos).
 */
export interface ModelInfo {
  /** Short stable key — localStorage and prop plumbing use this, not the repo. */
  id: string;
  repo: string;
  /** WebGPU-friendly quantization; every entry ships this exact export. */
  dtype: "q4f16";
  label: string;
  approxSize: string;
  blurb: string;
}

export const MODELS: ModelInfo[] = [
  {
    id: "1.2b",
    repo: "LiquidAI/LFM2.5-1.2B-Instruct-ONNX",
    dtype: "q4f16",
    label: "LFM2.5 1.2B Instruct",
    approxSize: "~700 MB",
    blurb: "Fast everyday model — chat, writing, and simple tools",
  },
  {
    id: "2.6b",
    repo: "LiquidAI/LFM2.5-2.6B-ONNX",
    dtype: "q4f16",
    label: "LFM2.5 2.6B",
    approxSize: "~1.6 GB",
    blurb: "More capable — better for longer tasks and tool use",
  },
  {
    id: "8b-a1b",
    repo: "LiquidAI/LFM2.5-8B-A1B-ONNX",
    dtype: "q4f16",
    label: "LFM2.5 8B A1B",
    approxSize: "~5 GB",
    blurb: "Fast and capable — best for reasoning and complex tasks",
  },
];

export const DEFAULT_MODEL_ID = "1.2b";

export function getModel(id: string): ModelInfo {
  return MODELS.find((m) => m.id === id) ?? MODELS[0]!;
}

const SELECTED_KEY = "ai-chat:model";
const READY_PREFIX = "ai-chat:model-ready:";

/** The model the user last picked (or the default). Persisted. */
export function selectedModelId(): string {
  try {
    const id = localStorage.getItem(SELECTED_KEY);
    if (id !== null && MODELS.some((m) => m.id === id)) return id;
  } catch {
    /* storage unavailable (private mode) — fall through to the default */
  }
  return DEFAULT_MODEL_ID;
}

export function setSelectedModelId(id: string): void {
  try {
    localStorage.setItem(SELECTED_KEY, id);
  } catch {
    /* ignore */
  }
}

/**
 * Per-model "weights are in the browser cache" flag. The old single-model
 * key (`ai-chat:model-ready`) referred to the retired Thinking repo and is
 * deliberately not migrated — those weights are no longer offered.
 */
export function isModelReady(modelId: string): boolean {
  try {
    return localStorage.getItem(READY_PREFIX + modelId) === "1";
  } catch {
    return false;
  }
}

export function markModelReady(modelId: string): void {
  try {
    localStorage.setItem(READY_PREFIX + modelId, "1");
  } catch {
    /* storage unavailable — worst case they see the download pitch again */
  }
}

export function clearModelReady(modelId: string): void {
  try {
    localStorage.removeItem(READY_PREFIX + modelId);
  } catch {
    /* ignore */
  }
}

/** Fraction (0..1) of the model weights downloaded so far. */
export type ModelProgressCallback = (progress: number) => void;

/** A model plus the worker that runs it; the caller must `dispose()` it. */
export interface ChatModelHandle {
  model: TransformersJSLanguageModel;
  /** Terminate the inference worker and release its GPU/model resources. */
  dispose: () => void;
}

/**
 * Build the chat model. Inference runs in a worker so the download and
 * token generation never block the UI thread — the app owns that worker so
 * it can terminate it (see `ChatModelHandle.dispose`).
 *
 * `onWorkerError` fires on the Worker `error` event (script-load failure,
 * CSP block, crash before the handler posts anything) — the provider only
 * settles on worker *messages*, so without this bridge a worker that never
 * starts would hang the load forever.
 */
export function createChatModel(
  info: ModelInfo,
  onWorkerError?: (reason: unknown) => void,
): ChatModelHandle {
  const worker = new Worker(new URL("./model-worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("error", (event) =>
    onWorkerError?.(event.error ?? new Error(event.message || "Worker failed to start")),
  );
  const model = transformersJS(info.repo, {
    device: "webgpu",
    dtype: info.dtype,
    worker,
  });
  return { model, dispose: () => worker.terminate() };
}

/**
 * Force model initialization so the download progress bar is driven by an
 * explicit "load" action rather than the first chat message. Initialization
 * is lazy inside the provider, so `createSessionWithProgress` is the public
 * way to trigger it; it reports aggregate download progress (0..1) and
 * resolves once the worker is ready. After this returns, the chat's first
 * reply is immediate.
 */
export async function loadModel(
  model: TransformersJSLanguageModel,
  onProgress?: ModelProgressCallback,
): Promise<void> {
  await model.createSessionWithProgress(onProgress);
}
