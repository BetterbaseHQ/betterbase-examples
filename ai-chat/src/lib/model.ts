import { transformersJS, type TransformersJSLanguageModel } from "@browser-ai/transformers-js";

/**
 * Local, in-browser model — no inference server involved.
 *
 * LFM2.5 Thinking is Liquid AI's reasoning variant: it works through the
 * problem inside `<think>…</think>` before answering. The ONNX export is
 * what Transformers.js runs on WebGPU; `q4f16` is the recommended
 * quantization for the browser (~760 MB of weights) — it downloads once and
 * is then served from the browser cache.
 */
export const MODEL_ID = "LiquidAI/LFM2.5-1.2B-Thinking-ONNX";
export const MODEL_LABEL = "LFM2.5 1.2B Thinking";
export const MODEL_DTYPE = "q4f16";
export const MODEL_APPROX_LABEL = "~760 MB";

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
export function createChatModel(onWorkerError?: (reason: unknown) => void): ChatModelHandle {
  const worker = new Worker(new URL("./model-worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("error", (event) =>
    onWorkerError?.(event.error ?? new Error(event.message || "Worker failed to start")),
  );
  const model = transformersJS(MODEL_ID, {
    device: "webgpu",
    dtype: MODEL_DTYPE,
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
