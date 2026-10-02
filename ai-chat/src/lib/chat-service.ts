import {
  extractReasoningMiddleware,
  generateText,
  wrapLanguageModel,
  type LanguageModel,
} from "ai";
import type { TransformersJSLanguageModel } from "@browser-ai/transformers-js";
import { cleanGeneratedTitle, fallbackTitle, titlePrompt } from "./titles.js";

/**
 * Parse `<think>` blocks out of the output into a separate reasoning part.
 * For models whose chat template prefills `<think>` (see
 * `ModelInfo.prefilledThink`), the output starts inside reasoning and only
 * ever contains the closing tag — `startWithReasoning` handles that form;
 * for plain models the default still guards against stray think blocks.
 */
export function wrapModel(
  model: TransformersJSLanguageModel,
  prefilledThink = false,
): LanguageModel {
  // Debug: set localStorage.debugStream = "1" to log the raw provider
  // stream (pre reasoning-extraction) part by part. Useful for diagnosing
  // token-level weirdness like swallowed preambles around tool calls.
  if (globalThis.localStorage?.getItem("debugStream") === "1") {
    const debugged = wrapLanguageModel({
      model,
      middleware: {
        middlewareVersion: "v2" as const,
        wrapStream: async ({
          doStream,
        }: {
          doStream: () => Promise<{
            stream: ReadableStream<{ type: string; delta?: string }>;
            request: unknown;
          }>;
        }) => {
          const { stream, request } = await doStream();
          return {
            stream: stream.pipeThrough(
              new TransformStream({
                transform(
                  part: { type: string; delta?: string },
                  controller: TransformStreamDefaultController<{ type: string; delta?: string }>,
                ) {
                  if (part.type === "text-delta") {
                    console.info(`[raw-stream] ${part.type}: ${JSON.stringify(part.delta ?? "")}`);
                  } else {
                    console.info(`[raw-stream] ${part.type}`);
                  }
                  controller.enqueue(part);
                },
              }),
            ) as typeof stream,
            request,
          };
        },
      } as never,
    });
    return wrapLanguageModel({
      model: debugged,
      middleware: extractReasoningMiddleware({
        tagName: "think",
        startWithReasoning: prefilledThink,
      }),
    });
  }
  return wrapLanguageModel({
    model,
    middleware: extractReasoningMiddleware({
      tagName: "think",
      startWithReasoning: prefilledThink,
    }),
  });
}
/**
 * System prompt — deliberately minimal. The thinking models in the registry
 * (2.6B) reason inside <think> tags and answer afterwards, and they format
 * answers in Markdown on their own; the model card's own examples pass
 * either no system message or the canonical one below. Richer instructions
 * steer these models into misreading them (observed: inventing "put your
 * final answer in a box" rules and emitting \boxed{…} like a math benchmark).
 */
export const CHAT_SYSTEM = [
  "You are a helpful assistant trained by Liquid AI,",
  "running entirely in the user's browser.",
].join(" ");

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
