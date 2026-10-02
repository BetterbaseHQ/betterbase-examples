import { jsonSchema, tool } from "ai";

/**
 * Web search for the chat, backed by the Parallel Search MCP.
 *
 * Talks to the remote Parallel Search MCP (`https://search.parallel.ai/mcp`)
 * over Streamable HTTP. That endpoint is free to use anonymously — no API key
 * required — and its CORS headers (`Access-Control-Allow-Origin: *`, verified
 * against the live endpoint) allow requests straight from the browser, so this
 * runs entirely client-side with no backend proxy.
 *
 * The exposed `web_search` tool mirrors Parallel's own schema but trims it to
 * just the two fields a model needs: `objective` and `search_queries` (the
 * `session_id` / `model_name` fields are omitted — they are for rate-limit
 * bookkeeping and analytics, not for answering).
 *
 * Higher rate limits want a Parallel API key. It is resolved in precedence
 * order: an explicit runtime override (see {@link setParallelApiKey}), then the
 * `VITE_PARALLEL_API_KEY` build-time variable. Absent both, requests go out
 * anonymous on the free tier — which is the default.
 */

const MCP_ENDPOINT = "https://search.parallel.ai/mcp";
/** Protocol version advertised on the initialize handshake (matches the live server). */
const MCP_PROTOCOL_VERSION = "2025-06-18";
/** Guard each fetch so a stuck request can't wedge the SDK tool loop. */
const FETCH_TIMEOUT_MS = 30_000;

/** A key a user can supply later to raise the free-tier rate limit.
 * Note: a `VITE_` value is baked into the client bundle at build time —
 * every visitor can extract it. Only ever point this at an anonymous
 * free-tier key; real keys go through `setParallelApiKey` at runtime. */
let apiKey: string | undefined = import.meta.env?.VITE_PARALLEL_API_KEY ?? undefined;

/** Persist a user-supplied Parallel API key (pass `null` to clear it). */
export function setParallelApiKey(key: string | null): void {
  apiKey = key ?? undefined;
}

/** Read the user-supplied Parallel API key, if any. */
export function readParallelApiKeySetting(): string | null {
  return apiKey ?? null;
}

export interface WebSearchInput {
  /** Focused, atomic natural-language goal for the search. */
  objective: string;
  /** 2-3 concise keyword queries; diverse phrasings work best. */
  search_queries: string[];
}

export interface WebSearchResult {
  /** The ranked results, formatted into a compact, model-friendly summary. */
  text: string;
}

/**
 * Parse the server's JSON payload (a JSON string) into a compact summary:
 * `• title — url` followed by its excerpts. Returns the raw text untouched if
 * it doesn't parse, so a format change on the server never kills the tool.
 *
 * Exported so the UI and the tests can pin the round-trip with
 * {@link parseSummarizedResults} — the two halves must stay format-compatible.
 */
export function summarizeResults(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      results?: Array<{ url?: string; title?: string; excerpts?: string[] }>;
    };
    if (!Array.isArray(parsed.results)) return raw;
    return parsed.results
      .map((r) => {
        const lines = [`• ${r.title ?? r.url ?? "(result)"}${r.url ? ` — ${r.url}` : ""}`];
        for (const excerpt of r.excerpts ?? []) lines.push(`    ${excerpt}`);
        return lines.join("\n");
      })
      .join("\n\n");
  } catch {
    return raw;
  }
}

/**
 * Tool-failure result — an app-level contract, not an SDK convention: the AI
 * SDK treats a *thrown* error from a tool as fatal (with the default
 * `errorMode: "none"` it ends the whole stream), so a failed search returns
 * this shape instead and lets the multi-step loop continue. The model reads
 * the JSON, and the UI's tool chip checks for `error` to render it red.
 */
export interface WebSearchError {
  error: true;
  message: string;
}

/** One search result as re-parsed by the UI from the summarized text. */
export interface ParsedSearchResult {
  title?: string;
  url?: string;
  excerpt?: string;
}

/**
 * Reverse of {@link summarizeResults}: turn the summarized tool output back
 * into per-result entries for the UI's tool chip. Both directions must stay
 * in sync — the tool output format is the coupling between them, pinned by
 * the round-trip test in parallel-search.test.ts.
 *
 * Anything that doesn't match (e.g. a raw, unparsed server payload) is
 * returned as a single entry with its first line as the excerpt, so the chip
 * never renders nothing.
 */
export function parseSummarizedResults(outputText: string): Array<ParsedSearchResult> {
  return outputText
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const firstLine = lines[0] ?? "";
      // summarizeResults emits `• title — url` then indented excerpt lines.
      const m = firstLine.match(/^•\s+(.+?)(?:\s+—\s+(\S+))?$/);
      const excerpt = lines
        .slice(1)
        .map((l) => l.trim())
        .join(" ")
        .slice(0, 200);
      return m ? { title: m[1], url: m[2], excerpt } : { excerpt: firstLine };
    });
}

/**
 * Minimal Streamable-HTTP MCP client for the Parallel Search server.
 *
 * Establishes a session with `initialize` (the server echoes a
 * `Mcp-Session-Id` header), acknowledges it, then drives `tools/call`. The
 * session is reused across calls and reset on any failure so the next call
 * re-initializes cleanly.
 */
class ParallelMcpClient {
  private sessionId: string | null = null;

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    };
    if (apiKey) h.Authorization = `Bearer ${apiKey}`;
    // The Streamable-HTTP spec requires the client to echo the session id on
    // every request after initialize; servers may reject requests without it.
    if (this.sessionId) h["Mcp-Session-Id"] = this.sessionId;
    return h;
  }

  /** Combine the caller's abort signal with a hard timeout so nothing hangs forever. */
  private combineSignal(base: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
      return AbortSignal.any([base, timeout]);
    }
    const controller = new AbortController();
    const onBase = () => controller.abort(base.reason);
    base.addEventListener("abort", onBase, { once: true });
    timeout.addEventListener("abort", () => controller.abort(timeout.reason), { once: true });
    return controller.signal;
  }

  private async ensureInitialized(signal: AbortSignal): Promise<void> {
    if (this.sessionId) return;
    const res = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: { ...this.headers(), Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "betterbase-ai-chat", version: "0.0.0" },
        },
      }),
      signal: this.combineSignal(signal),
    });
    if (!res.ok) {
      throw new Error(`Parallel MCP initialize failed (${res.status} ${res.statusText})`);
    }
    const session = res.headers.get("Mcp-Session-Id");
    if (!session) throw new Error("Parallel MCP did not return a session id");
    this.sessionId = session;
    // Acknowledge initialization — the server sends no response to this.
    await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      signal: this.combineSignal(signal),
    }).catch(() => {});
  }

  async webSearch(
    { objective, search_queries }: WebSearchInput,
    signal: AbortSignal,
  ): Promise<WebSearchResult> {
    try {
      await this.ensureInitialized(signal);
      const res = await fetch(MCP_ENDPOINT, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "web_search", arguments: { objective, search_queries } },
        }),
        signal: this.combineSignal(signal),
      });
      if (!res.ok) {
        throw new Error(`Parallel web_search failed (${res.status} ${res.statusText})`);
      }
      const body = (await res.json()) as {
        result?: { content?: Array<{ type: string; text?: string }> };
        error?: { message?: string };
      };
      if (body.error) {
        throw new Error(body.error.message ?? "Parallel web_search returned an error");
      }
      const text = (body.result?.content ?? [])
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join("\n\n");
      // Parse the server's JSON payload into a compact, model-friendly summary so
      // results read cleanly even when rendered to the user.
      return { text: summarizeResults(text) };
    } catch (err) {
      // Drop the (possibly dead) session so the next call re-initializes.
      this.sessionId = null;
      throw err;
    }
  }
}

/** One client, one session — the tool loop may call it repeatedly. */
const client = new ParallelMcpClient();

/**
 * The `web_search` tool, exposed to the chat through the AI SDK tool loop.
 *
 * When a tool-capable model emits a `web_search` call, the SDK runs `execute`
 * (this hits the Parallel MCP), feeds the results back, and continues — so the
 * multi-turn tool loop is handled by the SDK, not hand-rolled here.
 */
export const webSearchTool = tool<WebSearchInput, WebSearchResult | WebSearchError, {}>({
  description:
    "Search the public web for current, factual information. Use for questions needing up-to-date facts, " +
    "research, comparisons, or authoritative sources. Provide one focused objective and 2-3 keyword queries.",
  inputSchema: jsonSchema({
    type: "object",
    properties: {
      objective: {
        type: "string",
        description:
          "A focused, atomic natural-language description of what the search should find. " +
          "Include any preferred sources or freshness.",
      },
      search_queries: {
        type: "array",
        items: { type: "string" },
        description: "2-3 concise keyword queries (3-6 words each); diverse phrasings work best.",
      },
    },
    required: ["objective", "search_queries"],
  }),
  execute: async ({ objective, search_queries }, { abortSignal }) => {
    try {
      if (search_queries.length === 0) {
        return { error: true, message: "web_search requires at least one search query." };
      }
      console.info("[parallel-search] web_search start", { objective, search_queries });
      const result = await client.webSearch(
        { objective, search_queries },
        abortSignal ?? new AbortController().signal,
      );
      console.info("[parallel-search] web_search ok:", result.text.slice(0, 200));
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[parallel-search] web_search failed:", message);
      return { error: true, message: `Web search failed: ${message}` };
    }
  },
});
