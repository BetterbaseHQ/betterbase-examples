import { useMemo } from "react";
import { BetterbaseProvider, useConnectionStatus, useSync } from "betterbase/sync/react";
import { useQuery } from "betterbase/db/react";
import { useAuth, InvitationBanner, SyncedAppGate } from "@betterbase/examples-shared";
import { db, entries } from "@/lib/db";
import { useEntries } from "@/lib/sync";
import { EntriesScreen, type EntriesApi } from "@/components/EntriesScreen";

// ---------------------------------------------------------------------------
// LocalPasswordsApp — offline-first, no sharing (unauthenticated path)
// ---------------------------------------------------------------------------

function LocalPasswordsApp() {
  const result = useQuery(entries, { sort: [{ field: "site", direction: "asc" }] });

  const api = useMemo<EntriesApi>(
    () => ({
      entries: result?.records ?? [],
      loading: result === undefined,
      createEntry: async (data) => {
        await db.put(entries, data);
      },
      updateEntry: async (data, base) => {
        await db.patch(entries, data, base ? { base } : undefined);
      },
      deleteEntry: async (id) => {
        await db.delete(entries, id);
      },
    }),
    [result],
  );

  return <EntriesScreen api={api} />;
}

// ---------------------------------------------------------------------------
// PasswordsApp — synced + sharing (authenticated path, inside BetterbaseProvider)
// ---------------------------------------------------------------------------

function PasswordsApp() {
  const { session } = useAuth();
  const { error: syncError } = useSync();
  const syncStatus = useConnectionStatus();

  const {
    entries: allEntries,
    invitations,
    createEntry,
    updateEntry,
    deleteEntry,
    shareEntry,
    inviteToEntry,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
  } = useEntries();

  const personalSpaceId = session?.getPersonalSpaceId() ?? null;

  const api = useMemo<EntriesApi>(
    () => ({
      entries: allEntries,
      createEntry,
      updateEntry,
      deleteEntry,
    }),
    [allEntries, createEntry, updateEntry, deleteEntry],
  );

  const sharing = useMemo(
    () => ({
      personalSpaceId,
      isAdmin: (spaceId: string | null) => spaceId != null && isAdmin(spaceId),
      shareEntry,
      inviteToEntry,
      removeMember,
    }),
    [personalSpaceId, isAdmin, shareEntry, inviteToEntry, removeMember],
  );

  const banner =
    invitations.length > 0 ? (
      <InvitationBanner
        invitations={invitations}
        onAccept={acceptInvitation}
        onDecline={declineInvitation}
      />
    ) : undefined;

  return (
    <EntriesScreen
      api={api}
      sharing={sharing}
      banner={banner}
      syncStatus={syncStatus}
      syncError={syncError ?? undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// App — wraps PasswordsApp in BetterbaseProvider when authenticated
// ---------------------------------------------------------------------------

export default function App() {
  const { isAuthenticated, session, clientId, logout } = useAuth();
  if (isAuthenticated && session) {
    return (
      <BetterbaseProvider
        adapter={db}
        collections={[entries]}
        session={session}
        clientId={clientId}
        domain={import.meta.env.VITE_DOMAIN || "localhost:5377"}
        onAuthError={logout}
      >
        <SyncedAppGate>
          <PasswordsApp />
        </SyncedAppGate>
      </BetterbaseProvider>
    );
  }

  return <LocalPasswordsApp />;
}
