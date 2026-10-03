import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@betterbase/examples-shared/test";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { useAISDKRuntime } from "@assistant-ui/ai-sdk";
import type { ChatTransport } from "ai";
import { ChatThread } from "./ChatThread";
import type { AiChat } from "@/lib/use-ai-chat";

function msg(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

/** Long turns so a few messages decisively overflow the viewport. */
const PARAGRAPH = "The quick brown fox jumps over the lazy dog. ".repeat(20);

/** Streams one assistant reply as real UI-message chunks. */
const stubTransport: ChatTransport<UIMessage> = {
  sendMessages: async () =>
    new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "start" });
        controller.enqueue({ type: "text-start", id: "reply" });
        controller.enqueue({ type: "text-delta", id: "reply", delta: "A distinct reply arrives." });
        controller.enqueue({ type: "text-end", id: "reply" });
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      },
    }),
  reconnectToStream: async () => null,
};

/** Streams a failed web_search: the tool errors via a normal output payload. */
const failingToolTransport: ChatTransport<UIMessage> = {
  sendMessages: async () =>
    new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "start" });
        controller.enqueue({ type: "text-start", id: "q" });
        controller.enqueue({ type: "text-delta", id: "q", delta: "Search failed." });
        controller.enqueue({ type: "text-end", id: "q" });
        controller.enqueue({
          type: "tool-input-available",
          toolCallId: "call-1",
          toolName: "web_search",
          input: { objective: "find headphones", search_queries: ["headphones"] },
        });
        controller.enqueue({
          type: "tool-output-available",
          toolCallId: "call-1",
          output: { error: true, message: "The search backend is down." },
        });
        controller.enqueue({ type: "text-start", id: "reply" });
        controller.enqueue({ type: "text-delta", id: "reply", delta: "I could not search." });
        controller.enqueue({ type: "text-end", id: "reply" });
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      },
    }),
  reconnectToStream: async () => null,
};

/**
 * Drives ChatThread through the same path as production: a real `useChat`
 * instance (AI SDK) bridged by `useAISDKRuntime` (assistant-ui). History is
 * seeded via useChat's initial messages; sends go through the composer.
 */
function Harness({
  initialMessages,
  transport,
}: {
  initialMessages: UIMessage[];
  transport?: ChatTransport<UIMessage>;
}) {
  const chat = useChat({
    id: "t1",
    transport: transport ?? stubTransport,
    messages: initialMessages,
  });
  const runtime = useAISDKRuntime(chat);
  const aiChat: AiChat = {
    threads: [],
    threadsLoaded: true,
    activeThread: { id: "t1" } as AiChat["activeThread"],
    messages: chat.messages,
    status: chat.status,
    runtime,
    webSearch: false,
    setWebSearch: () => undefined,
    error: null,
    startChat: async () => "t1",
    sendMessage: async (text: string) => void chat.sendMessage({ text }),
    regenerate: () => undefined,
    editUserMessage: async () => undefined,
    deleteThread: async () => undefined,
    renameThread: async () => undefined,
    stop: chat.stop,
  };
  return <ChatThread chat={aiChat} />;
}

/** The scroll container is the overflow ancestor of the conversation log. */
function scrollParentOf(log: HTMLElement): HTMLElement {
  let el: HTMLElement | null = log.parentElement;
  while (el) {
    if (el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  throw new Error("no overflowing scroll container found");
}

const atBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight <= 40;

function longConversation(): UIMessage[] {
  return Array.from({ length: 6 }, (_, i) => msg(`m${i}`, i % 2 ? "assistant" : "user", PARAGRAPH));
}

describe("ChatThread scrolling (assistant-ui viewport)", () => {
  it("pins to the latest message once history overflows the viewport", async () => {
    renderWithProviders(<Harness initialMessages={longConversation()} />);

    const scroller = scrollParentOf(screen.getByRole("log"));
    await waitFor(() => expect(atBottom(scroller)).toBe(true), { timeout: 4000 });
  });

  it("hides the jump button at the bottom, shows it after scrolling up, and restores", async () => {
    renderWithProviders(<Harness initialMessages={longConversation()} />);

    const scroller = scrollParentOf(screen.getByRole("log"));
    await waitFor(() => expect(atBottom(scroller)).toBe(true), { timeout: 4000 });
    // Let the viewport's own observers settle before scrolling up.
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole("button", { name: "Scroll to bottom" })).toBeNull();

    scroller.scrollTop = 0;
    const jump = await screen.findByRole("button", { name: "Scroll to bottom" }, { timeout: 4000 });
    await userEvent.click(jump);
    await waitFor(() => expect(atBottom(scroller)).toBe(true), { timeout: 4000 });
  });

  it("follows an exchange sent from the composer: user message, then streaming reply", async () => {
    renderWithProviders(<Harness initialMessages={longConversation()} />);

    const scroller = scrollParentOf(screen.getByRole("log"));
    await waitFor(() => expect(atBottom(scroller)).toBe(true), { timeout: 4000 });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Message"), "One more question");
    await user.keyboard("{Enter}");

    // The reply streams in (markdown-rendered) while the viewport stays
    // pinned to the bottom.
    await waitFor(
      () => {
        expect(withinLog().getByText("One more question")).toBeVisible();
        expect(withinLog().getByText("A distinct reply arrives.")).toBeVisible();
        expect(atBottom(scroller)).toBe(true);
      },
      { timeout: 4000 },
    );

    function withinLog() {
      return within(screen.getByRole("log"));
    }
  });

  it("renders a failed web_search tool card from an error output payload", async () => {
    renderWithProviders(<Harness initialMessages={[]} transport={failingToolTransport} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Message"), "Find headphones");
    await user.keyboard("{Enter}");

    // The chip reports failure (red), not "0 results" — the tool errors via
    // a normal { error: true, message } output, not an output-error state.
    expect(await screen.findByText("Web search failed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /web search failed/i }));
    expect(await screen.findByText("The search backend is down.")).toBeVisible();
    // The surrounding reply text still renders.
    expect(screen.getByText("I could not search.")).toBeVisible();
  });
});
