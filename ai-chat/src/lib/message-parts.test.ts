import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import type { Message } from "./db";
import {
  orderPartsForDisplay,
  parsePersistedParts,
  toUIMessage,
  uiMessageToFields,
} from "./message-parts";

/**
 * Round-trip tests for the persistence mappers. The critical property: a
 * reply that interleaves non-text parts across steps — reasoning, tool,
 * more reasoning, another tool, then the answer — must re-materialize with
 * the blocks in the same order (a regression here silently merges the
 * thinking blocks together above the tools).
 */

function msg(parts: UIMessage["parts"]): UIMessage {
  return { id: "m1", role: "assistant", parts };
}

function record(fields: ReturnType<typeof uiMessageToFields>): Message {
  return {
    id: "m1",
    threadId: "t1",
    role: "assistant",
    sentAt: 1,
    ...fields,
  } as Message;
}

describe("message-parts round-trip", () => {
  it("preserves the order of reasoning and tool blocks across persistence", () => {
    const original = msg([
      { type: "reasoning", text: "I should search." },
      {
        type: "tool-web_search" as never,
        toolCallId: "c1",
        state: "output-available",
        input: { objective: "o", search_queries: ["q"] },
        output: { text: "results 1" },
      } as never,
      { type: "reasoning", text: "The results suggest a second search." },
      {
        type: "tool-web_search" as never,
        toolCallId: "c2",
        state: "output-available",
        input: { objective: "o2", search_queries: ["q2"] },
        output: { text: "results 2" },
      } as never,
      { type: "text", text: "Here is the answer." },
    ]);

    const fields = uiMessageToFields(original);
    // The final text is separate (sidebar + next-turn history).
    expect(fields.text).toBe("Here is the answer.");
    // Both thinking blocks survive, concatenated in the first-class field.
    expect(fields.reasoning).toBe("I should search.The results suggest a second search.");

    const restored = toUIMessage(record(fields));
    expect(restored.parts.map((p) => p.type)).toEqual([
      "reasoning",
      "tool-web_search",
      "reasoning",
      "tool-web_search",
      "text",
    ]);
    // And the second block's content is intact, after the first tool.
    const second = restored.parts[2] as { text?: string };
    expect(second.text).toBe("The results suggest a second search.");
    const secondTool = restored.parts[3] as unknown as { output?: { text?: string } };
    expect(secondTool.output?.text).toBe("results 2");
  });

  it("keeps a plain reasoning + text reply unchanged (no tools payload)", () => {
    const fields = uiMessageToFields(
      msg([
        { type: "reasoning", text: "thinking" },
        { type: "text", text: "answer" },
      ]),
    );
    expect(fields).toEqual({ text: "answer", reasoning: "thinking", tools: undefined });
    const restored = toUIMessage(record(fields));
    expect(restored.parts.map((p) => p.type)).toEqual(["reasoning", "text"]);
  });

  it("reads the legacy tools payload (tool calls without kind markers)", () => {
    const legacy = record({
      text: "answer",
      reasoning: "thinking",
      tools: JSON.stringify([{ toolName: "web_search", output: { text: "results" } }]),
    });
    const restored = toUIMessage(legacy);
    expect(restored.parts.map((p) => p.type)).toEqual(["reasoning", "tool-web_search", "text"]);
  });

  it("ignores a corrupt tools payload instead of throwing", () => {
    expect(parsePersistedParts("not json")).toEqual([]);
    expect(parsePersistedParts('["garbage"]')).toEqual([]);
  });

  it("hoists narration streamed after a tool call to before the chip", () => {
    // LFM2.5 streams: step 1 = tool call + narration, step 2 = answer.
    const parts: UIMessage["parts"] = [
      { type: "step-start" },
      {
        type: "tool-web_search" as never,
        toolCallId: "c1",
        state: "output-available",
        input: { objective: "x", search_queries: ["q"] },
        output: { text: "results" },
      } as never,
      { type: "text", text: "I am performing a web search." },
      { type: "step-start" },
      { type: "text", text: "Here is the summary." },
    ];
    expect(orderPartsForDisplay(parts).map((p) => p.type)).toEqual([
      "step-start",
      "text",
      "tool-web_search",
      "step-start",
      "text",
    ]);
  });

  it("keeps the answer below the chip when narration precedes it", () => {
    // A model that narrates BEFORE the call already streams the right
    // order — nothing should move.
    const parts: UIMessage["parts"] = [
      { type: "step-start" },
      { type: "text", text: "Searching now." },
      {
        type: "tool-web_search" as never,
        toolCallId: "c1",
        state: "output-available",
        output: { text: "results" },
      } as never,
      { type: "step-start" },
      { type: "text", text: "Summary." },
    ];
    expect(orderPartsForDisplay(parts).map((p) => p.type)).toEqual(parts.map((p) => p.type));
  });

  it("keeps reasoning between two tool calls in place while hoisting only text", () => {
    // Two calls in one step with reasoning after the first: the narration
    // lands above the step's tools; reasoning keeps its relative position.
    const parts: UIMessage["parts"] = [
      { type: "step-start" },
      {
        type: "tool-web_search" as never,
        toolCallId: "c1",
        state: "output-available",
        output: { text: "results 1" },
      } as never,
      { type: "reasoning", text: "narrowing down…" },
      {
        type: "tool-web_search" as never,
        toolCallId: "c2",
        state: "output-available",
        output: { text: "results 2" },
      } as never,
      { type: "text", text: "Running a second search." },
    ];
    const ordered = orderPartsForDisplay(parts);
    expect(ordered.map((p) => p.type)).toEqual([
      "step-start",
      "text",
      "tool-web_search",
      "reasoning",
      "tool-web_search",
    ]);
  });

  it("persists text-tool-text so a reload renders narration above the chip", () => {
    const fields = uiMessageToFields(
      msg([
        { type: "step-start" },
        {
          type: "tool-web_search" as never,
          toolCallId: "c1",
          state: "output-available",
          output: { text: "results" },
        } as never,
        { type: "text", text: "I am performing a web search." },
        { type: "step-start" },
        { type: "text", text: "Here is the summary." },
      ]),
    );
    // Concatenated text stays whole for history/next-turn use.
    expect(fields.text).toBe("I am performing a web search.Here is the summary.");
    const restored = toUIMessage(record(fields));
    expect(restored.parts.map((p) => p.type)).toEqual(["text", "tool-web_search", "text"]);
  });
});
