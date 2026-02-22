import { useState, useEffect, useCallback } from "react";
import { KeyRound, Plus } from "lucide-react";
import { LessProvider, useLessSync, useSyncReady } from "@betterbase/sdk/sync/react";
import { useQuery, useSyncStatus } from "@betterbase/sdk/db/react";
import {
  LessAppShell,
  useAuth,
  EmptyState,
  InvitationBanner,
  type SyncStatus,
} from "@betterbase/examples-shared";
import { db, entries } from "@/lib/db";
import type { Entry } from "@/lib/db";
import { useEntries } from "@/lib/sync";
import { CategoriesSidebar, type Category } from "@/components/CategoriesSidebar";
import { EntryList } from "@/components/EntryList";
import { EntryDetail } from "@/components/EntryDetail";
import { EntryForm } from "@/components/EntryForm";
import type { SpaceFields } from "@betterbase/sdk/sync";

// ---------------------------------------------------------------------------
// LocalPasswordsApp — offline-first, no sharing (unauthenticated path)
// ---------------------------------------------------------------------------

function LocalPasswordsApp() {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const { syncing, error: syncError } = useSyncStatus();
  const [selectedCategory, setSelectedCategory] = useState<Category>("all");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const result = useQuery(entries, {
    sort: [{ field: "site", direction: "asc" }],
  });
  const allEntries = result?.records ?? [];

  const filtered = allEntries.filter((e) => {
    if (selectedCategory !== "all" && e.category !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.site.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedEntry = allEntries.find((e) => e.id === selectedEntryId) ?? null;

  useEffect(() => {
    if (selectedEntryId && !allEntries.find((e) => e.id === selectedEntryId)) {
      setSelectedEntryId(null);
    }
  }, [selectedEntryId, allEntries]);

  const createEntry = useCallback((data: Omit<Entry, "id" | "createdAt" | "updatedAt">) => {
    db.put(entries, data);
    setCreating(false);
  }, []);

  const updateEntry = useCallback(
    (data: Omit<Entry, "id" | "createdAt" | "updatedAt"> & { id: string }) => {
      db.patch(entries, data);
      setEditingEntryId(null);
    },
    [],
  );

  const deleteEntry = useCallback(
    (id: string) => {
      db.delete(entries, id);
      if (selectedEntryId === id) setSelectedEntryId(null);
    },
    [selectedEntryId],
  );

  const counts = {
    all: allEntries.length,
    login: allEntries.filter((e) => e.category === "login").length,
    card: allEntries.filter((e) => e.category === "card").length,
    note: allEntries.filter((e) => e.category === "note").length,
    identity: allEntries.filter((e) => e.category === "identity").length,
  };

  const headerSyncStatus: SyncStatus | undefined = isAuthenticated
    ? syncError
      ? "error"
      : syncing
        ? "syncing"
        : "synced"
    : undefined;

  return (
    <LessAppShell
      appName="Less Passwords"
      appIcon={<KeyRound size={22} color="var(--mantine-color-indigo-6)" />}
      navbar={
        <CategoriesSidebar
          selected={selectedCategory}
          onSelect={(cat) => {
            setSelectedCategory(cat);
            setSelectedEntryId(null);
          }}
          counts={counts}
        />
      }
      navbarWidth={240}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={headerSyncStatus}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      {creating ? (
        <EntryForm
          category={selectedCategory === "all" ? "login" : selectedCategory}
          onSave={createEntry}
          onCancel={() => setCreating(false)}
        />
      ) : editingEntryId && selectedEntry ? (
        <EntryForm
          entry={selectedEntry}
          onSave={(data) => updateEntry({ ...data, id: selectedEntry.id })}
          onCancel={() => setEditingEntryId(null)}
        />
      ) : selectedEntry ? (
        <EntryDetail
          entry={selectedEntry}
          onEdit={() => setEditingEntryId(selectedEntry.id)}
          onDelete={() => deleteEntry(selectedEntry.id)}
          onBack={() => setSelectedEntryId(null)}
        />
      ) : (
        <EntryList
          entries={filtered}
          search={search}
          onSearchChange={setSearch}
          onSelect={setSelectedEntryId}
          onCreate={() => setCreating(true)}
          emptyState={
            allEntries.length === 0 ? (
              <EmptyState
                icon={<KeyRound size={32} />}
                title="No passwords yet"
                description="Add your first password to get started"
                action={<Plus size={16} style={{ display: "inline", verticalAlign: "middle" }} />}
              />
            ) : (
              <EmptyState icon={<KeyRound size={32} />} title="No matches" />
            )
          }
        />
      )}
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// PasswordsApp — synced + sharing (authenticated path, inside LessProvider)
// ---------------------------------------------------------------------------

function PasswordsApp({ personalSpaceId }: { personalSpaceId: string | null }) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const { syncing, error: syncError } = useLessSync();
  const [selectedCategory, setSelectedCategory] = useState<Category>("all");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const {
    entries: allEntries,
    invitations,
    createEntry,
    updateEntry,
    deleteEntry: hookDeleteEntry,
    shareEntry,
    inviteToEntry,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
  } = useEntries();

  const filtered = allEntries.filter((e) => {
    if (selectedCategory !== "all" && e.category !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.site.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedEntry =
    (allEntries.find((e) => e.id === selectedEntryId) as
      | ((typeof allEntries)[number] & SpaceFields)
      | undefined) ?? null;

  useEffect(() => {
    if (selectedEntryId && !allEntries.find((e) => e.id === selectedEntryId)) {
      setSelectedEntryId(null);
    }
  }, [selectedEntryId, allEntries]);

  const handleCreateEntry = useCallback(
    async (data: Omit<Entry, "id" | "createdAt" | "updatedAt">) => {
      await createEntry(data);
      setCreating(false);
    },
    [createEntry],
  );

  const handleUpdateEntry = useCallback(
    async (data: Omit<Entry, "id" | "createdAt" | "updatedAt"> & { id: string }) => {
      await updateEntry(data);
      setEditingEntryId(null);
    },
    [updateEntry],
  );

  const handleDeleteEntry = useCallback(
    async (id: string) => {
      await hookDeleteEntry(id);
      if (selectedEntryId === id) setSelectedEntryId(null);
    },
    [hookDeleteEntry, selectedEntryId],
  );

  const counts = {
    all: allEntries.length,
    login: allEntries.filter((e) => e.category === "login").length,
    card: allEntries.filter((e) => e.category === "card").length,
    note: allEntries.filter((e) => e.category === "note").length,
    identity: allEntries.filter((e) => e.category === "identity").length,
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
      appName="Less Passwords"
      appIcon={<KeyRound size={22} color="var(--mantine-color-indigo-6)" />}
      banner={banner}
      navbar={
        <CategoriesSidebar
          selected={selectedCategory}
          onSelect={(cat) => {
            setSelectedCategory(cat);
            setSelectedEntryId(null);
          }}
          counts={counts}
        />
      }
      navbarWidth={240}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={syncError ? "error" : syncing ? "syncing" : "synced"}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      {creating ? (
        <EntryForm
          category={selectedCategory === "all" ? "login" : selectedCategory}
          onSave={handleCreateEntry}
          onCancel={() => setCreating(false)}
        />
      ) : editingEntryId && selectedEntry ? (
        <EntryForm
          entry={selectedEntry}
          onSave={(data) => handleUpdateEntry({ ...data, id: selectedEntry.id })}
          onCancel={() => setEditingEntryId(null)}
        />
      ) : selectedEntry ? (
        <EntryDetail
          entry={selectedEntry}
          personalSpaceId={personalSpaceId}
          isAdmin={selectedEntry._spaceId ? isAdmin(selectedEntry._spaceId) : false}
          onEdit={() => setEditingEntryId(selectedEntry.id)}
          onDelete={() => handleDeleteEntry(selectedEntry.id)}
          onBack={() => setSelectedEntryId(null)}
          onShare={(handle) =>
            shareEntry(selectedEntry, handle).then((newEntry) => setSelectedEntryId(newEntry.id))
          }
          onInvite={(handle) => inviteToEntry(selectedEntry, handle)}
          onRemoveMember={(did) =>
            selectedEntry._spaceId ? removeMember(selectedEntry._spaceId, did) : Promise.resolve()
          }
        />
      ) : (
        <EntryList
          entries={filtered}
          personalSpaceId={personalSpaceId}
          search={search}
          onSearchChange={setSearch}
          onSelect={setSelectedEntryId}
          onCreate={() => setCreating(true)}
          emptyState={
            allEntries.length === 0 ? (
              <EmptyState
                icon={<KeyRound size={32} />}
                title="No passwords yet"
                description="Add your first password to get started"
                action={<Plus size={16} style={{ display: "inline", verticalAlign: "middle" }} />}
              />
            ) : (
              <EmptyState icon={<KeyRound size={32} />} title="No matches" />
            )
          }
        />
      )}
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// SyncGuard — waits for LessContext to be ready before rendering PasswordsApp.
// ---------------------------------------------------------------------------

function SyncGuard({ personalSpaceId }: { personalSpaceId: string | null }) {
  const ready = useSyncReady();
  if (!ready) return null;
  return <PasswordsApp personalSpaceId={personalSpaceId} />;
}

// ---------------------------------------------------------------------------
// App — wraps PasswordsApp in LessProvider when authenticated
// ---------------------------------------------------------------------------

export default function App() {
  const { isAuthenticated, session, clientId, logout } = useAuth();
  if (isAuthenticated && session) {
    return (
      <LessProvider
        adapter={db}
        collections={[entries]}
        session={session}
        clientId={clientId}
        domain={import.meta.env.VITE_DOMAIN || "localhost:5377"}
        onAuthError={logout}
      >
        <SyncGuard personalSpaceId={session.getPersonalSpaceId()} />
      </LessProvider>
    );
  }

  return <LocalPasswordsApp />;
}
