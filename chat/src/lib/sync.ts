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
import { moveToSpace, spaceOf, type SpaceFields } from "betterbase/sync";
import { conversations, messages, type Conversation, type Message } from "@/lib/db";

export function useConversations() {
  const db = useSyncDb();
  const {
    userExists,
    createSpace,
    invite,
    accept: acceptInvitation,
    decline: declineInvitation,
    removeMember,
    isAdmin,
  } = useSpaces();

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
   * Creates a shared space, puts the conversation in it, and invites the
   * recipient — all in one step. name defaults to the recipient's handle.
   */
  const startConversation = useCallback(
    async (recipientHandle: string, name?: string): Promise<Conversation & SpaceFields> => {
      const exists = await userExists(recipientHandle);
      if (!exists) throw new Error(`User "${recipientHandle}" not found`);

      // Store name as-is: empty string means "auto — compute from members".
      // spaceName in the invite is always non-empty so the invitation banner
      // shows something useful to the recipient.
      const customName = name?.trim() ?? "";
      const spaceLabel = customName || recipientHandle;
      const spaceId = await createSpace();

      // Create in personal space then move, so we get a properly typed SpaceFields result
      // @ts-expect-error TS2589: type depth limit
      const draft = await db.put(conversations, {
        name: customName,
        lastMessageText: "",
        lastMessageAt: Date.now(),
      });

      // Each failure path cleans up the records it created so retries don't
      // accumulate orphans. (The space itself can't be torn down — the SDK
      // exposes no space deletion via useSpaces yet.)
      let newConv;
      try {
        newConv = await moveToSpace(db, conversations, draft.id, spaceId);
      } catch (err) {
        await db.delete(conversations, draft.id).catch(() => {});
        throw err;
      }

      try {
        await invite(spaceId, recipientHandle, { spaceName: spaceLabel });
      } catch (err) {
        await db.delete(conversations, newConv.id).catch(() => {});
        throw err;
      }

      return newConv;
    },
    [db, userExists, createSpace, invite],
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
