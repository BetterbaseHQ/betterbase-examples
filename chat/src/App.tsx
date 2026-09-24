import { useState, useEffect, useCallback } from "react";
import { MessageCircle } from "lucide-react";
import { Box, Button } from "@mantine/core";
import { useConnectionStatus, useSync } from "betterbase/sync/react";
import {
  EmptyState,
  InvitationBanner,
  LessAppShell,
  ScopedAppTree,
  reportError,
  useAuth,
} from "@betterbase/examples-shared";
import {
  db,
  conversations,
  messages,
  openDatabaseForScope,
  deleteAnonymousDatabase,
  DB_NAME,
} from "@/lib/db";
import { useConversations } from "@/lib/sync";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ChatView } from "@/components/ChatView";

// ---------------------------------------------------------------------------
// SignInGate — shown when the user is not authenticated. Renders ABOVE the
// App-level DatabaseProvider: must not consume Database context (none is
// provided on this path).
// ---------------------------------------------------------------------------

function SignInGate() {
  const { handle, login, logout } = useAuth();
  // This button bypasses the header's connect modal, so login failures have
  // no other UI surface — report them here rather than swallowing.
  const handleLogin = () => {
    login().catch((err) => {
      reportError(err, "Couldn't start sign-in");
    });
  };
  return (
    <LessAppShell
      appName="Chat"
      appIcon={<MessageCircle size={22} color="var(--mantine-color-indigo-6)" />}
      isAuthenticated={false}
      handle={handle}
      onLogin={login}
      onLogout={logout}
    >
      <Box
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <EmptyState
          icon={<MessageCircle size={32} />}
          title="Sign in to start chatting"
          description="Chat requires an account to message other users"
          action={<Button onClick={handleLogin}>Sign in</Button>}
        />
      </Box>
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// ChatApp — synced (authenticated path, inside BetterbaseProvider)
// ---------------------------------------------------------------------------

function ChatApp({ personalSpaceId }: { personalSpaceId: string | null }) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const { error: syncError } = useSync();
  const syncStatus = useConnectionStatus();

  // Selection is remembered per account so switching accounts doesn't leak
  // (or flash) another account's conversation.
  const storageKey = handle ? `chat-selected-conv:${handle}` : null;
  const [selectedConvId, setSelectedConvId] = useState<string | null>(() =>
    storageKey ? localStorage.getItem(storageKey) : null,
  );

  const selectConv = useCallback(
    (id: string | null) => {
      setSelectedConvId(id);
      if (!storageKey) return;
      if (id) localStorage.setItem(storageKey, id);
      else localStorage.removeItem(storageKey);
    },
    [storageKey],
  );

  const {
    conversations: allConversations,
    messages: allMessages,
    invitations,
    startConversation,
    deleteConversation,
    sendMessage,
    renameConversation,
    inviteToConversation,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
  } = useConversations();

  useEffect(() => {
    if (allConversations.length > 0 && !allConversations.find((c) => c.id === selectedConvId)) {
      selectConv(allConversations[0]!.id);
    }
  }, [allConversations, selectedConvId]);

  const selectedConv = allConversations.find((c) => c.id === selectedConvId) ?? null;

  const convMessages = allMessages.filter((m) => m.conversationId === selectedConvId);

  const handleDeleteConversation = (id: string) => {
    deleteConversation(id)
      .catch((err) => reportError(err, "Couldn't delete conversation"))
      .finally(() => {
        if (selectedConvId === id) selectConv(null);
      });
  };

  const handleSendMessage = (text: string, id?: string) => {
    if (!selectedConv || !handle) return Promise.resolve();
    return sendMessage(selectedConv, text, handle, id).catch((err) => {
      reportError(err, "Couldn't send message");
      // Let ChatView keep the draft so the user doesn't lose the message
      throw err;
    });
  };

  const banner =
    invitations.length > 0 ? (
      <InvitationBanner
        invitations={invitations}
        onAccept={acceptInvitation}
        onDecline={declineInvitation}
      />
    ) : undefined;

  return (
    <LessAppShell
      appName="Chat"
      appIcon={<MessageCircle size={22} color="var(--mantine-color-indigo-6)" />}
      banner={banner}
      navbar={
        <ConversationSidebar
          conversations={allConversations}
          personalSpaceId={personalSpaceId}
          currentHandle={handle}
          selectedConversationId={selectedConvId}
          onSelect={setSelectedConvId}
          onStartChat={async (recipientHandle, name) => {
            const newConv = await startConversation(recipientHandle, name);
            selectConv(newConv.id);
          }}
          onDelete={handleDeleteConversation}
          onRename={(id, name) => {
            const conv = allConversations.find((c) => c.id === id);
            if (conv) {
              renameConversation(conv, name).catch((err) =>
                reportError(err, "Couldn't rename conversation"),
              );
            }
          }}
        />
      }
      navbarWidth={220}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={syncStatus}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      <ChatView
        conversation={selectedConv}
        messages={convMessages}
        currentHandle={handle}
        isAdmin={selectedConv?._spaceId ? isAdmin(selectedConv._spaceId) : false}
        onSendMessage={handleSendMessage}
        onInvite={
          selectedConv ? (h) => inviteToConversation(selectedConv, h) : () => Promise.resolve()
        }
        onRemoveMember={
          selectedConv?._spaceId
            ? (did) => removeMember(selectedConv._spaceId!, did)
            : () => Promise.resolve()
        }
      />
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// App — wraps ChatApp in BetterbaseProvider when authenticated, sign-in gate otherwise
// ---------------------------------------------------------------------------

export default function App() {
  // Signed-out renders the sign-in gate (no Database context consumed —
  // see SignInGate).
  return (
    <ScopedAppTree
      appName={DB_NAME}
      collections={[conversations, messages]}
      editChainCollections={[messages.name]}
      openDatabaseForScope={openDatabaseForScope}
      deleteAnonymousDatabase={deleteAnonymousDatabase}
      getDb={() => db}
      local={<SignInGate />}
    >
      {(session) => <ChatApp personalSpaceId={session.getPersonalSpaceId()} />}
    </ScopedAppTree>
  );
}
