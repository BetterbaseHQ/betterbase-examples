import { describe, it, expect } from "vitest";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import type { TransformersJSLanguageModel } from "@browser-ai/transformers-js";
import { generateThreadTitle, streamReply, wrapModel } from "./chat-service";

/** A mock raw model whose generate output is the given text. */
function mockModel(text: string): TransformersJSLanguageModel {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      finishReason: { unified: "stop", raw: undefined },
      content: [{ type: "text", text }],
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });
  // The wrapper's input type is the raw provider handle; the mock implements
  // the same interface the wrapper actually calls.
  return model as unknown as TransformersJSLanguageModel;
}

describe("generateThreadTitle", () => {
  it("strips the thinking block and keeps the named title", async () => {
    const model = wrapModel(mockModel("<think>they talked about addition</think>Math Question"));
    expect(await generateThreadTitle(model, "What is 2 + 2?", "Four.")).toBe("Math Question");
  });

  it("uses the raw text when the model answers without thinking", async () => {
    const model = wrapModel(mockModel("Https Explained"));
    expect(await generateThreadTitle(model, "explain https", "TLS encrypts…")).toBe(
      "Https Explained",
    );
  });

  it("treats output as reasoning-only-prefixed when the template prefills <think>", async () => {
    const model = wrapModel(mockModel("they talked about addition</think>Math Question"), true);
    expect(await generateThreadTitle(model, "What is 2 + 2?", "Four.")).toBe("Math Question");
  });

  it("falls back to the truncated message when generation throws", async () => {
    const throwing = new MockLanguageModelV4({
      doGenerate: () => {
        throw new Error("worker exploded");
      },
    });
    const model = wrapModel(throwing as unknown as TransformersJSLanguageModel);
    expect(await generateThreadTitle(model, "What is 2 + 2?", "Four.")).toBe("What is 2 + 2?");
  });

  it("falls back when the model produces nothing usable", async () => {
    const model = wrapModel(mockModel("<think>only thinking, no answer</think>"));
    expect(await generateThreadTitle(model, "What is 2 + 2?", "Four.")).toBe("What is 2 + 2?");
  });
});

describe("streamReply", () => {
  it("splits reasoning deltas from answer deltas", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          // Provider-level stream parts carry `delta` (the SDK normalizes
          // them to `text` on fullStream before they reach streamReply).
          { type: "reasoning-delta", id: "1", delta: "2 plus 2" },
          { type: "text-delta", id: "1", delta: "Four" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          },
        ]),
      }),
    });

    const updates: Array<{ reasoning: string; text: string }> = [];
    const { state, error } = await streamReply(
      model,
      [{ role: "user", content: "What is 2 + 2?" }],
      {
        onUpdate: (s) => updates.push({ ...s }),
      },
    );

    expect(error).toBeNull();
    expect(state).toEqual({ reasoning: "2 plus 2", text: "Four" });
    expect(updates.length).toBeGreaterThan(0);
  });

  it("splits prefilled-think output at the closing tag", async () => {
    // The 2.6B chat template prefills <think>, so the raw output has no
    // opening tag — reasoning flows as plain text until `</think>`.
    const model = wrapModel(
      new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: "text-delta", id: "1", delta: 'I should just answer."</think>' },
            { type: "text-delta", id: "1", delta: "Paris" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            },
          ]),
        }),
      }) as unknown as TransformersJSLanguageModel,
      true,
    );

    const { state, error } = await streamReply(model, [{ role: "user", content: "hi" }], {
      onUpdate: () => {},
    });

    expect(error).toBeNull();
    expect(state).toEqual({ reasoning: 'I should just answer."', text: "Paris" });
  });
});
