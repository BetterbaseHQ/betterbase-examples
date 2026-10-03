import {
  convertToModelMessages,
  generateText,
  NoSuchToolError,
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
 * The re-ask repair strategy from the AI SDK docs: append the failed tool
 * call and its validation error to the conversation and let the model
 * regenerate the call. Unknown tools are never repaired (nothing to fix).
 */
function repairToolCallWith(
  model: LanguageModel,
): NonNullable<Parameters<typeof streamText>[0]["experimental_repairToolCall"]> {
  return async ({ toolCall, tools, error, messages, instructions }) => {
    if (NoSuchToolError.isInstance(error)) return null;
    console.warn(`[chat] repairing malformed ${toolCall.toolName} args:`, error.message);
    try {
      const result = await generateText({
        model,
        instructions,
        tools,
        messages: [
          ...messages,
          {
            role: "assistant" as const,
            content: [
              {
                type: "tool-call" as const,
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                input: toolCall.input,
              },
            ],
          },
          {
            role: "tool" as const,
            content: [
              {
                type: "tool-result" as const,
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                output: { type: "text" as const, value: error.message },
              },
            ],
          },
        ],
      });
      const fixed = result.toolCalls.find((c) => c.toolName === toolCall.toolName);
      return fixed
        ? {
            type: "tool-call" as const,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            input: JSON.stringify(fixed.input),
          }
        : null;
    } catch {
      return null;
    }
  };
}

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
      // The composer's web-search toggle rides on the outgoing user
      // message's metadata; the model only sees the tool when it is on.
      // (A live regenerate re-sends the original metadata; a reloaded
      // thread has none, so regenerates there run toolless.)
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const webSearch =
        (lastUser?.metadata as { webSearch?: boolean } | undefined)?.webSearch === true;
      const tools = webSearch ? CHAT_TOOLS : {};
      const result = streamText({
        model,
        system: CHAT_SYSTEM,
        messages: await convertToModelMessages(messages),
        tools,
        abortSignal,
        // Without a stop condition the run halts after the first tool
        // result — the model is never re-invoked with it, so the reply
        // never arrives. 5 steps bounds chained tool use.
        stopWhen: stepCountIs(5),
        // Small local models sometimes emit malformed tool arguments. When
        // input validation fails, re-ask the same model with the error
        // appended (the SDK's documented re-ask strategy) instead of
        // surfacing a failed call to the user.
        experimental_repairToolCall: repairToolCallWith(model),
      });
      return toUIMessageStream({
        stream: result.fullStream,
        tools,
        // The thinking models' <think> traces stream as reasoning parts.
        sendReasoning: true,
      });
    },
    // A local model has no server stream to resume.
    reconnectToStream: async () => null,
  };
}
