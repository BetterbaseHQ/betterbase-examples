import { useState, useEffect, useCallback } from "react";
import { MessageCircle } from "lucide-react";
import { Box, Button } from "@mantine/core";
import { BetterbaseProvider, useConnectionStatus, useSync } from "betterbase/sync/react";
import {
  LessAppShell,
  SyncedAppGate,
  useAuth,
  EmptyState,
  InvitationBanner,
  reportError,
  accountScopeKey,
  useDbScope,
  DbScopeGate,
} from "@betterbase/examples-shared";
import { db, conversations, messages, openDatabaseForScope } from "@/lib/db";
import { useConversations } from "@/lib/sync";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ChatView } from "@/components/ChatView";

// ---------------------------------------------------------------------------
// SignInGate — shown when the user is not authenticated
// ---------------------------------------------------------------------------

function SignInGate() {
  const { handle, login, logout } = useAuth();
  const handleLogin = () => {
    login().catch(() => {
      /* failure rendered in the header's sync modal / console */
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

  const handleSendMessage = (text: string) => {
    if (!selectedConv || !handle) return Promise.resolve();
    return sendMessage(selectedConv, text, handle).catch((err) => {
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
  const { isAuthenticated, session, clientId, logout } = useAuth();
  const { ready: dbReady, key: dbScopeKey } = useDbScope(
    openDatabaseForScope,
    session ? accountScopeKey(session) : null,
  );
  if (!isAuthenticated || !session) return <SignInGate />;

  return (
    <DbScopeGate key={dbScopeKey} ready={dbReady}>
      <BetterbaseProvider
        adapter={db}
        collections={[conversations, messages]}
        editChainCollections={[messages.name]}
        session={session}
        clientId={clientId}
        domain={import.meta.env.VITE_DOMAIN || "localhost:5377"}
        onAuthError={logout}
      >
        <SyncedAppGate>
          <ChatApp personalSpaceId={session.getPersonalSpaceId()} />
        </SyncedAppGate>
      </BetterbaseProvider>
    </DbScopeGate>
  );
}
