/**
 * useConversations — domain-specific sync hook for the Chat app.
 *
 * All conversations are shared from creation: startConversation() creates a
 * space, creates the conversation in it, and immediately invites the recipient.
 * There is no personal/local conversation path — chat requires sync.
 *
 * Local mutations auto-sync via SyncEngine's db.onChange listener — no manual
 * scheduleSync() calls needed.
 *
 * Must be called inside BetterbaseProvider (authenticated path only).
 */

import { useRef, useCallback } from "react";
import { useSyncDb, useSpaces, usePendingInvitations, useQuery } from "betterbase/sync/react";
import { shareTree, ShareTreeError, spaceOf, type SpaceFields } from "betterbase/sync";
import { conversations, messages, type Conversation, type Message } from "@/lib/db";

export function useConversations() {
  const db = useSyncDb();
  const spaces = useSpaces();
  const {
    invite,
    accept: acceptInvitation,
    decline: declineInvitation,
    removeMember,
    isAdmin,
  } = spaces;

  const convResult = useQuery(conversations, {
    // id tie-breaker: wall-clock timestamps can tie or skew across devices
    sort: [
      { field: "lastMessageAt", direction: "desc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allConversations = convResult.records;

  const msgResult = useQuery(messages, {
    sort: [
      { field: "sentAt", direction: "asc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allMessages = msgResult.records;

  const invitations = usePendingInvitations();

  // Keep a ref to allMessages to avoid stale closure in deleteConversation
  const allMessagesRef = useRef(allMessages);
  allMessagesRef.current = allMessages;

  /**
   * Start a new conversation with another user.
   * Creates the conversation in the personal space, then shares it in one
   * step — shareTree checks the recipient exists, creates a shared space,
   * moves the conversation into it, and invites them. name defaults to the
   * recipient's handle.
   */
  const startConversation = useCallback(
    async (recipientHandle: string, name?: string): Promise<Conversation & SpaceFields> => {
      // Store name as-is: empty string means "auto — compute from members".
      // spaceName in the invite is always non-empty so the invitation banner
      // shows something useful to the recipient.
      const customName = name?.trim() ?? "";
      const spaceLabel = customName || recipientHandle;

      // Create in personal space then share, so we get a properly typed
      // SpaceFields result back (moves assign a fresh ID in the shared space).
      const draft = await db.put(conversations, {
        name: customName,
        lastMessageText: "",
        lastMessageAt: Date.now(),
      });

      try {
        const { parent: newConv } = await shareTree(db, spaces, {
          collection: conversations,
          id: draft.id,
          invitee: recipientHandle,
          spaceName: spaceLabel,
        });
        return newConv as Conversation & SpaceFields;
      } catch (err) {
        // Clean up so retries don't accumulate orphans. Once the move
        // succeeded the draft is already tombstoned — the ShareTreeError
        // carries the moved record so we delete that instead. (The space
        // itself can't be torn down — the SDK exposes no space deletion via
        // useSpaces yet.)
        const orphanId = err instanceof ShareTreeError && err.parent ? err.parent.id : draft.id;
        await db.delete(conversations, orphanId).catch(() => {});
        throw err;
      }
    },
    [db, spaces],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      const convMessages = allMessagesRef.current.filter((m) => m.conversationId === id);
      // allSettled: one failed message delete shouldn't block deleting the rest
      // (Promise.all would abort remaining deletes on first failure)
      await Promise.allSettled(convMessages.map((m) => db.delete(messages, m.id)));
      await db.delete(conversations, id);
    },
    [db],
  );

  const sendMessage = useCallback(
    async (conv: Conversation & SpaceFields, text: string, senderHandle: string) => {
      const sentAt = Date.now();
      await db.put(
        messages,
        { conversationId: conv.id, senderHandle, text, sentAt },
        spaceOf(conv),
      );
      await db.patch(conversations, {
        id: conv.id,
        lastMessageText: text,
        lastMessageAt: sentAt,
      });
    },
    [db],
  );

  const renameConversation = useCallback(
    async (conv: Conversation & { _spaceId?: string }, name: string) => {
      await db.patch(conversations, { id: conv.id, name });
    },
    [db],
  );

  const inviteToConversation = useCallback(
    async (conv: Conversation & { _spaceId?: string }, handle: string) => {
      if (!conv._spaceId) throw new Error("Cannot invite to a conversation without a space");
      await invite(conv._spaceId, handle, { spaceName: conv.name || handle });
    },
    [invite],
  );

  return {
    conversations: allConversations,
    messages: allMessages,
    invitations: invitations.records,
    startConversation,
    deleteConversation,
    sendMessage,
    renameConversation,
    inviteToConversation,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
  };
}

export type { Message };
