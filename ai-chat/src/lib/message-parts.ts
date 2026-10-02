import type { UIMessage } from "ai";
import type { Message } from "./db";

type MessageRecord = Message;

/**
 * Mapping between db message records and AI SDK UIMessages.
 *
 * A reply can interleave non-text parts across steps — reasoning, a tool
 * call, more reasoning, another tool call, then the final text. The record
 * stores the final text separately (`text`, what the next turn and the
 * sidebar consume), and the ordered non-text sequence (`tools`) so the
 * conversation re-renders with blocks in the order they streamed.
 */

/** One non-text part, in stream order — plus text parts so interleaved
 * narration survives reloads (text → tool → text). */
export type PersistedPart =
  | { kind: "reasoning"; text: string }
  | { kind: "text"; text: string }
  | {
      kind: "tool";
      toolName: string;
      input?: { objective?: string; search_queries?: string[] };
      output?: { text?: string } | { error: true; message: string };
    };

/** Parse the `tools` payload, tolerating the legacy tool-only shape. */
export function parsePersistedParts(raw: string | undefined): PersistedPart[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item): PersistedPart[] => {
    if (typeof item !== "object" || item === null) return [];
    const it = item as Record<string, unknown>;
    if (it.kind === "reasoning" && typeof it.text === "string") {
      return [{ kind: "reasoning", text: it.text }];
    }
    if (it.kind === "text" && typeof it.text === "string") {
      return [{ kind: "text", text: it.text }];
    }
    if (it.kind === "tool" && typeof it.toolName === "string") {
      return [
        {
          kind: "tool",
          toolName: it.toolName,
          input: it.input as { objective?: string; search_queries?: string[] } | undefined,
          output: it.output as { text?: string } | { error: true; message: string } | undefined,
        },
      ];
    }
    // Legacy: a bare tool call without `kind`.
    if (typeof it.toolName === "string") {
      return [
        {
          kind: "tool",
          toolName: it.toolName,
          input: it.input as { objective?: string; search_queries?: string[] } | undefined,
          output: it.output as { text?: string } | { error: true; message: string } | undefined,
        },
      ];
    }
    return [];
  });
}

/** db record → UIMessage, re-materializing parts in their original order. */
export function toUIMessage(m: MessageRecord): UIMessage {
  const parts: UIMessage["parts"] = [];
  const persisted = parsePersistedParts(m.tools);
  // `reasoning` holds the concatenated trace; when the ordered payload
  // carries it per-part, prefer that (avoid rendering it twice).
  const hasOrderedReasoning = persisted.some((p) => p.kind === "reasoning");
  if (m.reasoning && !hasOrderedReasoning) {
    parts.push({ type: "reasoning", text: m.reasoning });
  }
  // Text parts ordered around tools only exist in newer records; legacy
  // ones fall back to the concatenated `text` after the non-text parts.
  const hasOrderedText = persisted.some((p) => p.kind === "text");
  for (const part of persisted) {
    if (part.kind === "reasoning") {
      parts.push({ type: "reasoning", text: part.text });
    } else if (part.kind === "text") {
      parts.push({ type: "text", text: part.text });
    } else {
      parts.push({
        type: `tool-${part.toolName}` as never,
        toolCallId: `persisted-${part.toolName}-${parts.length}`,
        state: "output-available",
        input: part.input,
        output: part.output,
      } as never);
    }
  }
  if (!hasOrderedText && m.text) {
    parts.push({ type: "text", text: m.text });
  }
  return { id: m.id, role: m.role, parts };
}

/** UIMessage → db fields: final text separate, other parts kept in order. */
export function uiMessageToFields(
  m: UIMessage,
): Pick<MessageRecord, "text" | "reasoning" | "tools"> {
  const ordered = orderPartsForDisplay(m.parts);
  let text = "";
  const parts: PersistedPart[] = [];
  for (const part of ordered) {
    if (part.type === "text") {
      text += part.text;
      parts.push({ kind: "text", text: part.text });
    } else if (part.type === "reasoning") {
      parts.push({ kind: "reasoning", text: part.text ?? "" });
    } else if (part.type.startsWith("tool-")) {
      const tool = part as unknown as {
        input?: { objective?: string; search_queries?: string[] };
        output?: { text?: string } | { error: true; message: string };
      };
      parts.push({
        kind: "tool",
        toolName: part.type.slice("tool-".length),
        input: tool.input,
        output: tool.output,
      });
    }
  }
  // The full reasoning trace also lands in `reasoning` (the record's
  // first-class field) — concatenated there, but ordered per-part in `tools`.
  const reasoning = parts
    .filter((p): p is Extract<PersistedPart, { kind: "reasoning" }> => p.kind === "reasoning")
    .map((p) => p.text)
    .join("");
  // The payload matters when a tool call needs ordering context — a plain
  // reasoning reply is fully described by `reasoning` + `text`.
  const hasTool = parts.some((p) => p.kind === "tool");
  return {
    text,
    reasoning: reasoning || undefined,
    tools: hasTool ? JSON.stringify(parts) : undefined,
  };
}

/**
 * LFM2.5 narrates AFTER emitting a tool call, so the SDK streams the
 * narration as a text part following the tool part. Readers expect the
 * narration to introduce the search: hoist text that streamed after a tool
 * call to just before that step's first tool part, yielding text → tool →
 * text. Steps without tools keep their order; nothing moves across a
 * `step-start` boundary.
 */
export function orderPartsForDisplay(parts: UIMessage["parts"]): UIMessage["parts"] {
  // Without step boundaries (hand-built messages, tests) a trailing text
  // is the final answer — leave the order alone.
  if (!parts.some((p) => p.type === "step-start")) return parts;
  const isTool = (p: UIMessage["parts"][number]) => p.type.startsWith("tool-");
  const out: UIMessage["parts"] = [];
  let step: UIMessage["parts"] = [];
  const flush = () => {
    const firstTool = step.findIndex(isTool);
    if (firstTool === -1) {
      out.push(...step);
    } else {
      const hoisted = step.slice(firstTool + 1).filter((p) => p.type === "text");
      if (hoisted.length === 0) {
        out.push(...step);
      } else {
        out.push(
          ...step.slice(0, firstTool),
          ...hoisted,
          ...step.slice(firstTool).filter((p) => p.type !== "text"),
        );
      }
    }
    step = [];
  };
  for (const part of parts) {
    if (part.type === "step-start") {
      flush();
      out.push(part);
    } else {
      step.push(part);
    }
  }
  flush();
  return out;
}
