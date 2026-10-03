import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readUIMessageStream, type UIMessage } from "ai";
import { createLocalChatTransport } from "./local-chat-transport";
import { wrapModel } from "./chat-service";

/** Drain a UI-message stream to its final message snapshot. */
async function finalMessage(
  stream: Parameters<typeof readUIMessageStream>[0]["stream"],
): Promise<UIMessage> {
  let last: UIMessage | undefined;
  for await (const m of readUIMessageStream({ stream })) last = m;
  if (last === undefined) throw new Error("UI message stream produced no message");
  return last;
}

/**
 * Integration test of the canonical AI SDK wiring: a mock language model
 * that emits a `web_search` tool call, a mocked Parallel MCP endpoint, and
 * the real transport. Pins that the tool loop runs end-to-end — the model
 * call, the tool execution against the MCP client, and the UI-message
 * stream the React layer renders (reasoning, tool input/output, text).
 */

const SEARCH_INPUT = {
  objective: "Find the best noise cancelling headphones",
  search_queries: ["best noise cancelling headphones 2026"],
};

const MCP_RESULTS = {
  search_id: "s1",
  results: [
    { url: "https://example.com/anc", title: "Best ANC", excerpts: ["Bose tops the list"] },
  ],
};

/** Minimal LanguageModel whose doStream script plays out over calls. */
function mockModel(script: Array<Array<Record<string, unknown>>>) {
  let call = 0;
  return {
    specificationVersion: "v4",
    provider: "mock",
    modelId: "mock-model",
    supportedUrls: {},
    doStream: async () => {
      const parts = script[Math.min(call, script.length - 1)]!;
      call += 1;
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
        request: { body: {} },
      };
    },
    doGenerate: async () => ({
      content: [],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {},
      request: { body: {} },
    }),
  } as unknown as Parameters<typeof createLocalChatTransport>[0];
}

const streamStart = { type: "stream-start", warnings: [] };
const usage = { inputTokens: { total: 1 }, outputTokens: { total: 1 } };

/** Mock the Parallel MCP endpoint: initialize → session, tools/call → results. */
function mockMcp() {
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { method: string };
    if (body.method === "initialize") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
        status: 200,
        headers: { "Mcp-Session-Id": "sess-1", "Content-Type": "application/json" },
      });
    }
    if (body.method === "tools/call") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: { content: [{ type: "text", text: JSON.stringify(MCP_RESULTS) }] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // notifications/initialized and anything else: accepted, no body.
    return new Response(null, { status: 202 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createLocalChatTransport", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("runs the full tool loop: model call → web_search execution → UI-message stream", async () => {
    const fetchMock = mockMcp();
    const model = mockModel([
      // First model call: emits the web_search tool call.
      [
        streamStart,
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "web_search",
          input: JSON.stringify(SEARCH_INPUT),
        },
        { type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage },
      ],
      // Second model call (after the tool result): the answer.
      [
        streamStart,
        { type: "text-start", id: "t0" },
        { type: "text-delta", id: "t0", delta: "Bose, based on the search." },
        { type: "text-end", id: "t0" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
      ],
    ]);

    const transport = createLocalChatTransport(model);
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "c1",
      messageId: undefined,
      messages: [
        {
          id: "m1",
          role: "user",
          // The composer's web-search toggle rides on the user message.
          metadata: { webSearch: true },
          parts: [{ type: "text", text: "best headphones?" }],
        } as UIMessage,
      ],
      abortSignal: undefined,
    });

    // Drain the UI-message stream into the final assistant message.
    const message = await finalMessage(stream);

    // The MCP client ran: initialize + tools/call against the endpoint,
    // with the model's objective/queries as arguments.
    const calls = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(calls.find((c) => c.method === "tools/call")?.params.arguments).toEqual(SEARCH_INPUT);

    // The tool part carries the summarized MCP output for the UI to render.
    const toolPart = message.parts.find((p) => p.type === "tool-web_search") as {
      type: string;
      state: string;
      output?: { text?: string };
    };
    expect(toolPart).toBeDefined();
    expect(toolPart.state).toBe("output-available");
    expect(toolPart.output?.text).toContain("Best ANC");

    // The final answer streamed as a text part after the tool ran.
    const textPart = message.parts.find((p) => p.type === "text") as { text?: string };
    expect(textPart?.text).toBe("Bose, based on the search.");
  });

  it("emits reasoning parts from <think> output so the UI can show the trace", async () => {
    mockMcp();
    // Production wraps the model with the reasoning middleware before the
    // transport sees it (see use-ai-chat) — compose the same way here.
    const raw = mockModel([
      [
        streamStart,
        { type: "text-start", id: "t0" },
        { type: "text-delta", id: "t0", delta: "<think>2 plus 2 is 4</think>Four." },
        { type: "text-end", id: "t0" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
      ],
    ]);
    const model = wrapModel(raw as never) as Parameters<typeof createLocalChatTransport>[0];

    const transport = createLocalChatTransport(model);
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "c1",
      messageId: undefined,
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "2+2?" }] } as UIMessage],
      abortSignal: undefined,
    });
    const message = await finalMessage(stream);

    const reasoning = message.parts.find((p) => p.type === "reasoning") as { text?: string };
    const text = message.parts.find((p) => p.type === "text") as { text?: string };
    expect(reasoning?.text).toContain("2 plus 2 is 4");
    expect(text?.text).toBe("Four.");
  });

  it("hides the web_search tool when the toggle is off (no metadata)", async () => {
    let sawTools: unknown = "never-called";
    const base = mockModel([
      [streamStart, { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage }],
    ]) as unknown as Record<string, unknown>;
    const model = {
      ...base,
      doStream: async (options: { tools?: unknown }) => {
        sawTools = options.tools;
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue(streamStart);
              controller.enqueue({ type: "text-start", id: "t0" });
              controller.enqueue({ type: "text-delta", id: "t0", delta: "hi back" });
              controller.enqueue({ type: "text-end", id: "t0" });
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage,
              });
              controller.close();
            },
          }),
          request: { body: {} },
        };
      },
    } as unknown as Parameters<typeof createLocalChatTransport>[0];

    const transport = createLocalChatTransport(model);
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "c1",
      messageId: undefined,
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] } as UIMessage],
      abortSignal: undefined,
    });
    await finalMessage(stream); // streamText is lazy: drain to run the model

    // The model cannot call a tool it cannot see: the toggle gates the set
    // (an empty ToolSet reaches the model as undefined).
    expect(sawTools ?? {}).toEqual({});
  });

  it("surfaces a failed web_search as a tool error part instead of killing the stream", async () => {
    // No MCP mock: every fetch rejects, so the tool's execute fails and
    // returns its error result — the loop must continue to the answer.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const model = mockModel([
      [
        streamStart,
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "web_search",
          input: JSON.stringify(SEARCH_INPUT),
        },
        { type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage },
      ],
      [
        streamStart,
        { type: "text-start", id: "t0" },
        { type: "text-delta", id: "t0", delta: "I could not search." },
        { type: "text-end", id: "t0" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
      ],
    ]);

    const transport = createLocalChatTransport(model);
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "c1",
      messageId: undefined,
      messages: [
        {
          id: "m1",
          role: "user",
          metadata: { webSearch: true },
          parts: [{ type: "text", text: "search" }],
        } as UIMessage,
      ],
      abortSignal: undefined,
    });
    const message = await finalMessage(stream);

    const toolPart = message.parts.find((p) => p.type === "tool-web_search") as {
      output?: { error?: boolean; message?: string };
    };
    expect(toolPart?.output?.error).toBe(true);
    expect(toolPart?.output?.message).toContain("network down");
    const text = message.parts.find((p) => p.type === "text") as { text?: string };
    expect(text?.text).toBe("I could not search.");
  });
});
