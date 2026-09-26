import { useMemo } from "react";
import { useConnectionStatus, useSync, useSpaceStatus } from "betterbase/sync/react";
import { useQuery } from "betterbase/db/react";
import { InvitationBanner, ScopedAppTree, useAuth } from "@betterbase/examples-shared";
import { db, entries, openDatabaseForScope, deleteAnonymousDatabase, DB_NAME } from "@/lib/db";
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

/**
 * Removal probe for a shared entry's space. Called as a hook from
 * EntriesScreen via the `sharing` seam, so the local (provider-less) path
 * can opt out. Removal re-keys the space — this flips the detail view to
 * the removed-space notice the moment the victim's client learns it.
 */
function useRemovedEntrySpace(spaceId: string | null) {
  const { status, name } = useSpaceStatus(spaceId ?? undefined);
  return { removed: status === "removed", name };
}

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
      useRemovedSpace: useRemovedEntrySpace,
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
  return (
    <ScopedAppTree
      appName={DB_NAME}
      collections={[entries]}
      openDatabaseForScope={openDatabaseForScope}
      deleteAnonymousDatabase={deleteAnonymousDatabase}
      getDb={() => db}
      local={<LocalPasswordsApp />}
    >
      {() => <PasswordsApp />}
    </ScopedAppTree>
  );
}
