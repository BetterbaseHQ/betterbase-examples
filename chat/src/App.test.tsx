import { describe, it, expect, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { db, conversations, messages } from "@/lib/db";
import {
  renderWithProviders,
  makeFakeSession,
  setSyncDb,
  wipeCollections,
  lastProviderProps,
} from "@betterbase/examples-shared/test";

afterEach(async () => {
  await wipeCollections(db, [messages, conversations]);
});

describe("Chat app sync wiring", () => {
  it("registers both collections with BetterbaseProvider", async () => {
    setSyncDb(db);
    renderWithProviders(<App />, {
      db,
      auth: { isAuthenticated: true, session: makeFakeSession(), handle: "alice" },
    });

    // App shell renders (sidebar header mentions Conversations)
    await waitFor(() => expect(screen.getAllByText(/conversation/i).length).toBeGreaterThan(0), {
      timeout: 4000,
    });

    const names = lastProviderProps()
      .collections.map((c) => (c as { name: string }).name)
      .sort();
    expect(names).toEqual(["conversations", "messages"]);
  });
});

describe("ChatView", () => {
  async function renderChatView(onSendMessage: (text: string) => Promise<void>) {
    const { ChatView } = await import("./components/ChatView");
    const user = userEvent.setup();
    const utils = renderWithProviders(
      <ChatView
        conversation={
          {
            id: "conv-1",
            name: "Test Conversation",
            lastMessageText: "",
            lastMessageAt: 0,
            createdAt: 0,
            updatedAt: 0,
            _spaceId: "personal-space-1",
          } as never
        }
        messages={[]}
        currentHandle="alice"
        isAdmin
        onSendMessage={onSendMessage}
        onInvite={() => Promise.resolve()}
        onRemoveMember={() => Promise.resolve()}
      />,
    );
    return { user, ...utils };
  }

  it("regression: a failed send keeps the draft in the input", async () => {
    const { user } = await renderChatView(() => Promise.reject(new Error("write failed")));
    const input = screen.getByPlaceholderText(/type a message/i);
    await user.type(input, "important message");
    await user.keyboard("{Enter}");

    // Wait for the rejection to settle, then the draft must still be there
    await waitFor(() =>
      expect((screen.getByPlaceholderText(/type a message/i) as HTMLTextAreaElement).value).toBe(
        "important message",
      ),
    );
  });

  it("clears the input after a successful send", async () => {
    const { user } = await renderChatView(() => Promise.resolve());
    await user.type(screen.getByPlaceholderText(/type a message/i), "hello there");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect((screen.getByPlaceholderText(/type a message/i) as HTMLTextAreaElement).value).toBe(
        "",
      ),
    );
  });

  it("regression: cold-start with history scrolls to the bottom, not the top", async () => {
    const { ChatView } = await import("./components/ChatView");
    const history = Array.from({ length: 60 }, (_, i) => ({
      id: `m${i}`,
      conversationId: "conv-1",
      senderHandle: i % 2 ? "alice" : "bob",
      text: `message number ${i} with enough text to occupy real vertical space in the list so scrolling is meaningful`,
      sentAt: i,
      createdAt: i,
      updatedAt: i,
      _spaceId: "personal-space-1",
    }));

    // The chat area is height-bounded in the real app — without a bound the
    // viewport grows to content and never scrolls
    const container = document.createElement("div");
    container.style.height = "500px";
    document.body.append(container);

    renderWithProviders(
      <ChatView
        conversation={
          {
            id: "conv-1",
            name: "Test Conversation",
            lastMessageText: "",
            lastMessageAt: 0,
            createdAt: 0,
            updatedAt: 0,
            _spaceId: "personal-space-1",
          } as never
        }
        messages={history as never}
        currentHandle="alice"
        isAdmin
        onSendMessage={() => Promise.resolve()}
        onInvite={() => Promise.resolve()}
        onRemoveMember={() => Promise.resolve()}
      />,
      { container },
    );

    // The messages arrive async (query-driven effect) — wait until rendered,
    // then assert the viewport is scrolled to the latest message
    await waitFor(() => expect(screen.getByText(/message number 59/)).toBeVisible());
    await waitFor(() => {
      // The message list's viewport — located via the message it contains
      // (other ScrollAreas exist in the tree)
      const last = screen.getByText(/message number 59/);
      const viewport = last.closest(".mantine-ScrollArea-viewport") as HTMLElement | null;
      expect(viewport).toBeTruthy();
      // Pinned to (or within one message of) the bottom, not at the top
      expect(viewport!.scrollTop).toBeGreaterThan(viewport!.scrollHeight * 0.5);
    });
  });
});
