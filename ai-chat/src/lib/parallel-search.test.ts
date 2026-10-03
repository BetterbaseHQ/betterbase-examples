import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { parseSummarizedResults, summarizeResults, webSearchTool } from "./parallel-search";

/**
 * Failure-contract tests for the Parallel MCP client: the tool must never
 * throw into the SDK's tool loop — it returns an error-shaped output the
 * model can read — and a failed session is dropped so the next call
 * re-initializes instead of reusing a dead session id.
 */

const controller = () => new AbortController().signal;

function jsonRpcResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web_search tool failure contract", () => {
  it("returns an error-shaped output when initialize is rejected (bad key)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));

    const out = (await webSearchTool.execute(
      { objective: "x", search_queries: ["q"] },
      { abortSignal: controller(), toolCallId: "c1", messages: [], context: {} },
    )) as { error?: boolean; message?: string };

    expect(out.error).toBe(true);
    expect(out.message).toMatch(/initialize failed \(401/);
  });

  it("returns an error-shaped output on a JSON-RPC error and resets the session", async () => {
    // initialize + initialized notification succeed …
    fetchMock.mockResolvedValueOnce(
      jsonRpcResponse(
        { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } },
        { headers: { "Content-Type": "application/json", "Mcp-Session-Id": "sess-1" } },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    // … then tools/call fails outright.
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));

    const out = (await webSearchTool.execute(
      { objective: "x", search_queries: ["q"] },
      { abortSignal: controller(), toolCallId: "c1", messages: [], context: {} },
    )) as { error?: boolean; message?: string };

    expect(out.error).toBe(true);
    expect(out.message).toMatch(/web_search failed \(500/);

    // The next call re-initializes (a fresh initialize request, not a
    // tools/call on the dead session).
    fetchMock.mockResolvedValueOnce(
      jsonRpcResponse(
        { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } },
        { headers: { "Content-Type": "application/json", "Mcp-Session-Id": "sess-1" } },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    fetchMock.mockResolvedValueOnce(
      jsonRpcResponse({
        jsonrpc: "2.0",
        id: 2,
        result: { content: [{ type: "text", text: '{"results":[]}' }] },
      }),
    );
    const retry = (await webSearchTool.execute(
      { objective: "x", search_queries: ["q"] },
      { abortSignal: controller(), toolCallId: "c2", messages: [], context: {} },
    )) as { error?: boolean; text?: string };

    expect(retry.error).toBeUndefined();
    const initializeCalls = fetchMock.mock.calls.filter(([, init]) =>
      String((init as RequestInit | undefined)?.body ?? "").includes('"initialize"'),
    );
    expect(initializeCalls.length).toBe(2);
  });

  it("echoes the Mcp-Session-Id header on every request after initialize", async () => {
    // Reset the singleton client's session first (a 500 on any request drops
    // it), so the flow below starts from a clean initialize regardless of
    // what earlier tests left behind.
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    await webSearchTool.execute(
      { objective: "x", search_queries: ["q"] },
      { abortSignal: controller(), toolCallId: "c0", messages: [], context: {} },
    );

    fetchMock
      .mockResolvedValueOnce(
        jsonRpcResponse(
          { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } },
          { headers: { "Content-Type": "application/json", "Mcp-Session-Id": "sess-9" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        jsonRpcResponse({
          jsonrpc: "2.0",
          id: 2,
          result: { content: [{ type: "text", text: '{"results":[]}' }] },
        }),
      );

    await webSearchTool.execute(
      { objective: "x", search_queries: ["q"] },
      { abortSignal: controller(), toolCallId: "c1", messages: [], context: {} },
    );

    const calls = fetchMock.mock.calls
      .slice(1)
      .map(([, init]) => new Headers(init?.headers as HeadersInit));
    // initialize carries no session id yet; the initialized ack and
    // tools/call must echo the id the server issued.
    expect(calls[0]!.get("Mcp-Session-Id")).toBeNull();
    expect(calls[1]!.get("Mcp-Session-Id")).toBe("sess-9");
    expect(calls[2]!.get("Mcp-Session-Id")).toBe("sess-9");
  });

  it("rejects empty query lists without touching the network", async () => {
    const out = (await webSearchTool.execute(
      { objective: "x", search_queries: [] },
      { abortSignal: controller(), toolCallId: "c1", messages: [], context: {} },
    )) as { error?: boolean; message?: string };

    expect(out.error).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("coerces a bare-string search_queries into an array before sending", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRpcResponse(
        { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } },
        { headers: { "Content-Type": "application/json", "Mcp-Session-Id": "sess-c" } },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    fetchMock.mockResolvedValueOnce(
      jsonRpcResponse({
        jsonrpc: "2.0",
        id: 2,
        result: { content: [{ type: "text", text: '{"results":[]}' }] },
      }),
    );

    const out = (await webSearchTool.execute(
      // The model emitted one string instead of an array of strings.
      { objective: "find headphones", search_queries: "best headphones 2026" } as never,
      { abortSignal: controller(), toolCallId: "c1", messages: [], context: {} },
    )) as { error?: boolean };

    expect(out.error).toBeUndefined();
    const callBody = fetchMock.mock.calls
      .map(([, init]) => String((init as RequestInit | undefined)?.body ?? ""))
      .find((b) => b.includes("tools/call"));
    expect(callBody).toContain('["best headphones 2026"]');
  });

  it("returns a model-actionable error for unrecoverable argument shapes", async () => {
    const out = (await webSearchTool.execute(
      { objective: "find headphones", search_queries: { queries: ["a"] } } as never,
      { abortSignal: controller(), toolCallId: "c1", messages: [], context: {} },
    )) as { error?: boolean; message?: string };

    expect(out.error).toBe(true);
    // The message must tell the model the expected JSON shape so the
    // thinking-model retry loop can self-correct.
    expect(out.message).toMatch(/array of strings/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces in-band server validation errors (MCP isError) as failures, not results", async () => {
    // Drop any session the singleton client still holds, so the initialize
    // mock below is consumed by an actual initialize.
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    await webSearchTool.execute(
      { objective: "reset", search_queries: ["q"] },
      { abortSignal: controller(), toolCallId: "c0", messages: [], context: {} },
    );
    fetchMock.mockResolvedValueOnce(
      jsonRpcResponse(
        { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } },
        { headers: { "Content-Type": "application/json", "Mcp-Session-Id": "sess-e" } },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    // The server reports argument-validation failures as a normal result
    // with isError: true (pydantic message in the text).
    fetchMock.mockResolvedValueOnce(
      jsonRpcResponse({
        jsonrpc: "2.0",
        id: 2,
        result: {
          isError: true,
          content: [{ type: "text", text: "Error executing tool web_search: 1 validation error" }],
        },
      }),
    );

    const out = (await webSearchTool.execute(
      { objective: "x", search_queries: ["q"] },
      { abortSignal: controller(), toolCallId: "c1", messages: [], context: {} },
    )) as { error?: boolean; message?: string };

    expect(out.error).toBe(true);
    expect(out.message).toMatch(/validation error/);
  });
});

describe("input schema validation (jsonSchema validate)", () => {
  it("coerces a bare-string search_queries and derives a missing objective", async () => {
    const out = await (
      webSearchTool.inputSchema as unknown as { validate: (v: unknown) => Promise<unknown> }
    ).validate({ search_queries: "best headphones" });
    expect(out).toEqual({
      success: true,
      value: { objective: "best headphones", search_queries: ["best headphones"] },
    });
  });

  it("rejects unrecoverable shapes with a model-actionable error", async () => {
    const out = (await (
      webSearchTool.inputSchema as unknown as { validate: (v: unknown) => Promise<unknown> }
    ).validate({ search_queries: 42 })) as {
      success: boolean;
      error?: Error;
    };
    expect(out.success).toBe(false);
    expect(out.error?.message).toMatch(/array of strings/);
  });
});

describe("summarizeResults / parseSummarizedResults round-trip", () => {
  // The tool chip re-parses the summarized text the model gets; this pins
  // the format contract between the two halves of that coupling.
  const PAYLOAD = JSON.stringify({
    search_id: "s1",
    results: [
      {
        url: "https://example.com/anc",
        title: "Best ANC",
        excerpts: ["Bose tops the list", "Sony close behind"],
      },
      { url: "https://example.com/no-title", excerpts: ["A lone excerpt"] },
    ],
  });

  it("parses back the title, url and excerpt of every result", () => {
    const parsed = parseSummarizedResults(summarizeResults(PAYLOAD));
    expect(parsed).toEqual([
      {
        title: "Best ANC",
        url: "https://example.com/anc",
        excerpt: "Bose tops the list Sony close behind",
      },
      {
        title: "https://example.com/no-title",
        url: "https://example.com/no-title",
        excerpt: "A lone excerpt",
      },
    ]);
  });

  it("surfaces unparsed server text as a single entry instead of nothing", () => {
    const parsed = parseSummarizedResults(summarizeResults("not json at all"));
    expect(parsed).toEqual([{ title: undefined, url: undefined, excerpt: "not json at all" }]);
  });
});
