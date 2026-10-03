import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@betterbase/examples-shared/test";
import type { UIMessage } from "ai";
import { ChatThread } from "./ChatThread";
import type { AiChat } from "@/lib/use-ai-chat";

/** A chat prop good enough for ChatThread: it only reads these fields. */
function fakeChat(overrides: Partial<AiChat> = {}): AiChat {
  return {
    threads: [],
    threadsLoaded: true,
    activeThread: { id: "t1" } as AiChat["activeThread"],
    messages: [],
    status: "ready",
    error: null,
    startChat: async () => "t1",
    sendMessage: async () => undefined,
    regenerate: () => undefined,
    editUserMessage: async () => undefined,
    deleteThread: async () => undefined,
    renameThread: async () => undefined,
    stop: () => undefined,
    ...overrides,
  };
}

function msg(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

/** Long turns so a few messages decisively overflow the viewport. */
const PARAGRAPH = "The quick brown fox jumps over the lazy dog. ".repeat(20);

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

describe("ChatThread scrolling", () => {
  it("pins to the latest message once history overflows the viewport", async () => {
    renderWithProviders(
      <ChatThread
        chat={fakeChat({
          messages: Array.from({ length: 6 }, (_, i) =>
            msg(`m${i}`, i % 2 ? "assistant" : "user", PARAGRAPH),
          ),
        })}
        onDraftStart={async () => "t1"}
      />,
    );

    const log = screen.getByRole("log");
    const scroller = scrollParentOf(log);
    // ResizeObserver re-pins after late layout, so poll.
    await waitFor(() => expect(atBottom(scroller)).toBe(true), { timeout: 4000 });
  });

  it("follows streaming growth while pinned, but stops after scrolling up", async () => {
    const chat = fakeChat({
      status: "streaming",
      messages: [
        msg("u1", "user", PARAGRAPH),
        msg("a1", "assistant", PARAGRAPH),
        msg("u2", "user", PARAGRAPH),
        msg("a2", "assistant", PARAGRAPH),
      ],
    });
    const { rerender } = renderWithProviders(
      <ChatThread chat={chat} onDraftStart={async () => "t1"} />,
    );

    const log = screen.getByRole("log");
    const scroller = scrollParentOf(log);

    // Streaming growth keeps the newest content in view (ResizeObserver
    // fires async after layout).
    rerender(
      <ChatThread
        chat={fakeChat({
          status: "streaming",
          messages: [...chat.messages, msg("a3", "assistant", PARAGRAPH)],
        })}
        onDraftStart={async () => "t1"}
      />,
    );
    await waitFor(() => expect(atBottom(scroller)).toBe(true), { timeout: 4000 });

    // Scrolling up disarms auto-follow: later growth stays where it was.
    scroller.scrollTop = 0;
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Scroll to bottom" })).toBeVisible(),
      {
        timeout: 4000,
      },
    );
    const before = scroller.scrollTop;
    rerender(
      <ChatThread
        chat={fakeChat({
          status: "streaming",
          messages: [
            ...chat.messages,
            msg("a3", "assistant", PARAGRAPH),
            msg("a4", "assistant", PARAGRAPH),
          ],
        })}
        onDraftStart={async () => "t1"}
      />,
    );
    expect(scroller.scrollTop).toBe(before);

    // The jump button restores the pinned behavior — instantly, so growth
    // racing the click (streaming while jumping) cannot land it short.
    await userEvent.click(screen.getByRole("button", { name: "Scroll to bottom" }));
    rerender(
      <ChatThread
        chat={fakeChat({
          status: "streaming",
          messages: [...chat.messages, msg("a5", "assistant", PARAGRAPH)],
        })}
        onDraftStart={async () => "t1"}
      />,
    );
    await waitFor(() => expect(atBottom(scroller)).toBe(true), { timeout: 4000 });
  });

  it("re-pins and jumps when a message is sent from a scrolled-up position", async () => {
    const chat = fakeChat({
      messages: [
        msg("u1", "user", PARAGRAPH),
        msg("a1", "assistant", PARAGRAPH),
        msg("u2", "user", PARAGRAPH),
        msg("a2", "assistant", PARAGRAPH),
      ],
    });
    const { rerender } = renderWithProviders(
      <ChatThread chat={chat} onDraftStart={async () => "t1"} />,
    );

    const log = screen.getByRole("log");
    const scroller = scrollParentOf(log);
    await waitFor(() => expect(atBottom(scroller)).toBe(true), { timeout: 4000 });
    // Let the ResizeObserver's initial (frame-delayed) delivery settle —
    // scrolling up before it would race it and scroll straight back.
    await new Promise((r) => setTimeout(r, 100));

    // The user had scrolled up to quote something…
    scroller.scrollTop = 0;
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Scroll to bottom" })).toBeVisible(),
      {
        timeout: 4000,
      },
    );

    // …then sends: the outgoing message must land in view.
    rerender(
      <ChatThread
        chat={fakeChat({
          status: "submitted",
          messages: [...chat.messages, msg("u3", "user", PARAGRAPH)],
        })}
        onDraftStart={async () => "t1"}
      />,
    );
    await waitFor(() => expect(atBottom(scroller)).toBe(true), { timeout: 4000 });
  });
});
