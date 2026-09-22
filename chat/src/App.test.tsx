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
  resetSyncMocks,
  setSpaceMembers,
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
  afterEach(() => resetSyncMocks());

  async function renderChatView(
    onSendMessage: (text: string, id?: string) => Promise<void>,
    messages: readonly unknown[] = [],
  ) {
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
        messages={messages as never}
        currentHandle="alice"
        isAdmin
        onSendMessage={onSendMessage}
        onInvite={() => Promise.resolve()}
        onRemoveMember={() => Promise.resolve()}
      />,
    );
    return { user, ...utils };
  }

  it("AUD-050: shield requires the chain author's member handle to match the claimed sender", async () => {
    setSpaceMembers("personal-space-1", [
      { did: "did:key:bob", role: "write", status: "joined", handle: "bob@example.com" },
      { did: "did:key:eve", role: "write", status: "joined", handle: "eve@example.com" },
    ]);
    await renderChatView(
      () => Promise.resolve(),
      [
        // Legit: bob's chain author maps to bob's handle -> verified shield.
        {
          id: "m-bob",
          conversationId: "conv-1",
          senderHandle: "bob@example.com",
          text: "genuinely from bob",
          sentAt: 1,
          createdAt: 1,
          updatedAt: 1,
          _editChain: [{ author: "did:key:bob", timestamp: 1, diffs: [] }],
          _editChainValid: true,
        },
        // Spoofed: eve signed, claims bob's handle -> warning, not a shield.
        {
          id: "m-spoof",
          conversationId: "conv-1",
          senderHandle: "bob@example.com",
          text: "forged attribution",
          sentAt: 2,
          createdAt: 2,
          updatedAt: 2,
          _editChain: [{ author: "did:key:eve", timestamp: 2, diffs: [] }],
          _editChainValid: true,
        },
        // Unsigned claim (chain absent): no shield, handle displayed as-is.
        {
          id: "m-plain",
          conversationId: "conv-1",
          senderHandle: "bob@example.com",
          text: "no chain yet",
          sentAt: 3,
          createdAt: 3,
          updatedAt: 3,
        },
      ],
    );

    // Exactly one verified shield (bob's real message) and one warning.
    expect(screen.getAllByLabelText("Verified sender")).toHaveLength(1);
    expect(screen.getAllByLabelText("Sender identity doesn't match signature")).toHaveLength(1);
  });

  it("AUD-051: a replacement draft typed during a pending send survives completion", async () => {
    let releaseSend: (() => void) | undefined;
    let calls = 0;
    const sent = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const { user } = await renderChatView(() => {
      calls += 1;
      return sent;
    });

    const input = screen.getByPlaceholderText(/type a message/i) as HTMLTextAreaElement;
    await user.type(input, "original");
    await user.keyboard("{Enter}");
    // The send is still pending — a second Enter and a Send click must not
    // double-fire the submission.
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(calls).toBe(1);
    // The send is still pending — start a new draft.
    await user.type(input, " and more");

    releaseSend!();
    // After resolution the newer text must still be there.
    await waitFor(() => {
      expect((screen.getByPlaceholderText(/type a message/i) as HTMLTextAreaElement).value).toBe(
        "original and more",
      );
    });
  });

  it("AUD-051: retrying a failed send reuses the submission id (no duplicate commit)", async () => {
    const ids: (string | undefined)[] = [];
    let fail = true;
    const { user } = await renderChatView((_text, id) => {
      ids.push(id);
      return fail ? Promise.reject(new Error("preview patch failed")) : Promise.resolve();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    await user.type(input, "please persist");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(ids).toHaveLength(1));
    expect(ids[0]).toEqual(expect.any(String));

    // Same draft, second attempt (user presses send again after the error).
    fail = false;
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(ids).toHaveLength(2));
    // The retry must target the same record: same id, so db.put overwrites
    // instead of appending a duplicate message.
    expect(ids[1]).toBe(ids[0]);
    // And the draft clears on success.
    await waitFor(() =>
      expect((screen.getByPlaceholderText(/type a message/i) as HTMLTextAreaElement).value).toBe(
        "",
      ),
    );
  });

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
      // (other ScrollAreas exist in the tree). Uses Mantine's internal class
      // deliberately: this is a layout test, and the class is stable across
      // Mantine 7.x minors.
      const last = screen.getByText(/message number 59/);
      const viewport = last.closest(".mantine-ScrollArea-viewport") as HTMLElement | null;
      expect(viewport).toBeTruthy();
      // Pinned to (or within one message of) the bottom, not at the top
      expect(viewport!.scrollTop).toBeGreaterThan(viewport!.scrollHeight * 0.5);
    });
  });
});
