import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { Box, Button } from "@mantine/core";
import { BetterbaseProvider, useSync, useSyncReady } from "betterbase/sync/react";
import { LessAppShell, useAuth, EmptyState, InvitationBanner } from "@betterbase/examples-shared";
import { db, conversations, messages } from "@/lib/db";
import { useConversations } from "@/lib/sync";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ChatView } from "@/components/ChatView";
import type { SpaceFields } from "betterbase/sync";

// ---------------------------------------------------------------------------
// SignInGate — shown when the user is not authenticated
// ---------------------------------------------------------------------------

function SignInGate() {
  const { handle, login, logout } = useAuth();
  return (
    <LessAppShell
      appName="Less Chat"
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
          description="Less Chat requires an account to message other users"
          action={<Button onClick={login}>Sign in</Button>}
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
  const { syncing, error: syncError } = useSync();
  const [selectedConvId, setSelectedConvId] = useState<string | null>(() =>
    localStorage.getItem("chat-selected-conv"),
  );

  const selectConv = (id: string | null) => {
    setSelectedConvId(id);
    if (id) localStorage.setItem("chat-selected-conv", id);
    else localStorage.removeItem("chat-selected-conv");
  };

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

  const selectedConv =
    (allConversations.find((c) => c.id === selectedConvId) as
      | ((typeof allConversations)[number] & SpaceFields)
      | undefined) ?? null;

  const convMessages = allMessages.filter((m) => m.conversationId === selectedConvId);

  const handleDeleteConversation = async (id: string) => {
    if (
      !window.confirm(
        "Delete this conversation and all its messages for all members? This cannot be undone.",
      )
    )
      return;
    await deleteConversation(id);
    if (selectedConvId === id) selectConv(null);
  };

  const handleSendMessage = (text: string) => {
    if (!selectedConv || !handle) return;
    sendMessage(selectedConv, text, handle).catch(console.error);
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
      appName="Less Chat"
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
            if (conv)
              renameConversation(conv as typeof conv & SpaceFields, name).catch(console.error);
          }}
        />
      }
      navbarWidth={220}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={syncError ? "error" : syncing ? "syncing" : "synced"}
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
// SyncGuard — waits for LessContext to be ready before rendering ChatApp.
// ---------------------------------------------------------------------------

function SyncGuard({ personalSpaceId }: { personalSpaceId: string | null }) {
  const ready = useSyncReady();
  if (!ready) return null;
  return <ChatApp personalSpaceId={personalSpaceId} />;
}

// ---------------------------------------------------------------------------
// App — wraps ChatApp in BetterbaseProvider when authenticated, sign-in gate otherwise
// ---------------------------------------------------------------------------

export default function App() {
  const { isAuthenticated, session, clientId, logout } = useAuth();
  if (!isAuthenticated || !session) return <SignInGate />;

  return (
    <BetterbaseProvider
      adapter={db}
      collections={[conversations, messages]}
      editChainCollections={["messages"]}
      session={session}
      clientId={clientId}
      domain={import.meta.env.VITE_DOMAIN || "localhost:5377"}
      onAuthError={logout}
    >
      <SyncGuard personalSpaceId={session.getPersonalSpaceId()} />
    </BetterbaseProvider>
  );
}
