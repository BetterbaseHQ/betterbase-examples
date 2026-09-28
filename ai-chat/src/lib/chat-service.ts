import {
  extractReasoningMiddleware,
  generateText,
  streamText,
  wrapLanguageModel,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import type { TransformersJSLanguageModel } from "@browser-ai/transformers-js";
import { cleanGeneratedTitle, fallbackTitle, titlePrompt } from "./titles.js";

/**
 * All current models are non-thinking, but the middleware still guards the
 * output: if a stray `<think>` block ever leaks into a reply (training
 * quirk), it's parsed out into a separate reasoning part instead of
 * polluting the answer text.
 */
export function wrapModel(model: TransformersJSLanguageModel): LanguageModel {
  return wrapLanguageModel({
    model,
    middleware: extractReasoningMiddleware({ tagName: "think" }),
  });
}

/**
 * System prompt — deliberately minimal. LFM2.5-Thinking is trained to
 * reason inside <think> tags and answer afterwards, and it formats answers
 * in Markdown on its own; the model card's own examples pass either no
 * system message or the canonical one below. Richer instructions steer the
 * 1.2B model into misreading them (observed: inventing "put your final
 * answer in a box" rules and emitting \boxed{…} like a math benchmark).
 */
const CHAT_SYSTEM = [
  "You are a helpful assistant trained by Liquid AI,",
  "running entirely in the user's browser.",
].join(" ");

/** Streaming state of one assistant reply. */
export interface ReplyState {
  reasoning: string;
  text: string;
}

export interface StreamReplyOptions {
  signal?: AbortSignal;
  /** Called as reasoning/text accumulate (already-throttling callers). */
  onUpdate: (state: ReplyState) => void;
}

export interface StreamReplyResult {
  /** Whatever streamed before completion (possibly partial). */
  state: ReplyState;
  /** Model error (WebGPU OOM, worker crash, …) or null. */
  error: unknown;
}

/**
 * Generate one assistant reply and stream it via `onUpdate`. Never throws:
 * resolves with whatever streamed plus the error if the run failed or was
 * aborted, so callers keep partial output on interruption.
 */
export async function streamReply(
  model: LanguageModel,
  history: ModelMessage[],
  options: StreamReplyOptions,
): Promise<StreamReplyResult> {
  const state: ReplyState = { reasoning: "", text: "" };
  let error: unknown = null;
  try {
    const result = streamText({
      model,
      system: CHAT_SYSTEM,
      messages: history,
      abortSignal: options.signal,
    });

    for await (const chunk of result.fullStream) {
      switch (chunk.type) {
        case "reasoning-delta":
          state.reasoning += chunk.text;
          options.onUpdate(state);
          break;
        case "text-delta":
          state.text += chunk.text;
          options.onUpdate(state);
          break;
      }
    }
  } catch (err) {
    // Includes a synchronous throw from `streamText` itself (programming
    // error) — the contract is resolve-never-throw.
    error = err;
  }
  return { state, error };
}

/** True when generation was aborted mid-stream. */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * Name the thread with the model itself. Returns the fallback title if
 * generation fails or produces nothing usable.
 */
export async function generateThreadTitle(
  model: LanguageModel,
  userText: string,
  assistantReply: string,
): Promise<string> {
  try {
    const result = await generateText({
      model,
      prompt: titlePrompt(userText, assistantReply),
      abortSignal: AbortSignal.timeout(30_000),
    });
    return cleanGeneratedTitle(result.text) ?? fallbackTitle(userText);
  } catch {
    return fallbackTitle(userText);
  }
}
