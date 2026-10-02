import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { webSearchTool } from "./parallel-search";

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

  it("rejects empty query lists without touching the network", async () => {
    const out = (await webSearchTool.execute(
      { objective: "x", search_queries: [] },
      { abortSignal: controller(), toolCallId: "c1", messages: [], context: {} },
    )) as { error?: boolean; message?: string };

    expect(out.error).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
