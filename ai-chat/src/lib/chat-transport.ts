import {
  convertToModelMessages,
  streamText,
  toUIMessageStream,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import type { TransformersJSLanguageModel } from "@browser-ai/transformers-js";

/**
 * Bridges the Vercel AI SDK's chat state (`useChat`) to a model that runs
 * locally in the browser. There is no HTTP endpoint: `streamText` consumes the
 * Transformers.js model directly and its stream is re-encoded as UI message
 * chunks, so the app gets the same streaming semantics as a server-backed
 * chat.
 */
export class LocalChatTransport implements ChatTransport<UIMessage> {
  private readonly model: TransformersJSLanguageModel;
  private readonly system: string | undefined;

  constructor(model: TransformersJSLanguageModel, system?: string) {
    this.model = model;
    this.system = system;
  }

  async sendMessages(
    options: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0],
  ): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal } = options;
    const prompt = await convertToModelMessages(messages);

    const result = streamText({
      model: this.model,
      system: this.system,
      messages: prompt,
      abortSignal,
    });

    // No server sits behind this transport, so there are no server secrets to
    // protect: surface the real error (WebGPU OOM, worker failure, …) instead
    // of the SDK's generic "An error occurred.".
    return toUIMessageStream({
      stream: result.stream,
      onError: (error) => (error instanceof Error ? error.message : String(error)),
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    // Local inference has no server-side stream to reattach to.
    return null;
  }
}
