import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type ChatTransport,
  type LanguageModel,
  type ToolSet,
  type UIMessage,
} from "ai";
import { webSearchTool } from "./parallel-search";
import { CHAT_SYSTEM } from "./chat-service";

/**
 * The tools exposed to the model. `web_search` runs through the Parallel
 * Search MCP entirely client-side (see parallel-search.ts); the AI SDK owns
 * the tool loop — execute, feed results back, re-invoke — via streamText.
 */
export const CHAT_TOOLS: ToolSet = { web_search: webSearchTool };

/**
 * The local in-browser model as an AI SDK `ChatTransport`.
 *
 * This is the canonical client-side wiring for `useChat`: instead of a
 * `DefaultChatTransport` hitting an HTTP endpoint, `sendMessages` runs
 * `streamText` against the Transformers.js model right here and hands the
 * UI-message stream back to React. Everything downstream — message state,
 * streaming parts (text, reasoning, tool calls/results), status, stop,
 * regenerate — is owned by `useChat` and the SDK, not hand-rolled here.
 */
export function createLocalChatTransport(model: LanguageModel): ChatTransport<UIMessage> {
  return {
    sendMessages: async ({ messages, abortSignal, trigger }) => {
      console.info(`[chat] transport: ${trigger} — ${messages.length} messages`);
      const result = streamText({
        model,
        system: CHAT_SYSTEM,
        messages: await convertToModelMessages(messages),
        tools: CHAT_TOOLS,
        abortSignal,
        // Without a stop condition the run halts after the first tool
        // result — the model is never re-invoked with it, so the reply
        // never arrives. 5 steps bounds chained tool use.
        stopWhen: stepCountIs(5),
      });
      return toUIMessageStream({
        stream: result.fullStream,
        tools: CHAT_TOOLS,
        // The thinking models' <think> traces stream as reasoning parts.
        sendReasoning: true,
      });
    },
    // A local model has no server stream to resume.
    reconnectToStream: async () => null,
  };
}
