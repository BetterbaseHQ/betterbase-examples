import { useState, useEffect, useMemo, type ReactNode } from "react";
import { KeyRound, Plus } from "lucide-react";
import { Box, Loader } from "@mantine/core";
import { LessAppShell, useAuth, EmptyState, reportError } from "@betterbase/examples-shared";
import type { ConnectionStatus } from "betterbase/sync/react";
import type { Entry } from "@/lib/db";
import { CategoriesSidebar, type Category } from "./CategoriesSidebar";
import { EntryList } from "./EntryList";
import { EntryDetail } from "./EntryDetail";
import { EntryForm } from "./EntryForm";

type Spaced<T> = T & { _spaceId?: string };

export type EntryData = Omit<Entry, "id" | "createdAt" | "updatedAt">;

/** Data + mutations shared by the local and synced adapters. */
export interface EntriesApi {
  entries: readonly Spaced<Entry>[];
  /** True while the initial local query is still loading. */
  loading?: boolean;
  createEntry: (data: EntryData) => Promise<void> | void;
  updateEntry: (data: EntryData & { id: string }) => Promise<void> | void;
  deleteEntry: (id: string) => Promise<void> | void;
}

export interface EntriesSharing {
  personalSpaceId: string | null;
  isAdmin: (spaceId: string | null) => boolean;
  shareEntry: (entry: Spaced<Entry>, handle: string) => Promise<unknown>;
  inviteToEntry: (entry: Spaced<Entry>, handle: string) => Promise<void>;
  removeMember: (spaceId: string, did: string) => Promise<void>;
}

interface EntriesScreenProps {
  api: EntriesApi;
  sharing?: EntriesSharing;
  banner?: ReactNode;
  syncStatus?: ConnectionStatus;
  syncError?: string;
}

/** The passwords UI shared by the local (unauthenticated) and synced paths. */
export function EntriesScreen({ api, sharing, banner, syncStatus, syncError }: EntriesScreenProps) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<Category>("all");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const allEntries = api.entries;

  useEffect(() => {
    if (selectedEntryId && !allEntries.find((e) => e.id === selectedEntryId)) {
      setSelectedEntryId(null);
      // Don't leave the edit form armed for whichever entry is opened next
      setEditing(false);
    }
  }, [selectedEntryId, allEntries]);

  const { filtered, counts } = useMemo(() => {
    const q = search.toLowerCase();
    const matching = allEntries.filter((e) => {
      if (selectedCategory !== "all" && e.category !== selectedCategory) return false;
      if (q) {
        return (
          e.site.toLowerCase().includes(q) ||
          e.username.toLowerCase().includes(q) ||
          e.url.toLowerCase().includes(q)
        );
      }
      return true;
    });
    const byCategory = (category: string) =>
      allEntries.filter((e) => e.category === category).length;
    return {
      filtered: matching,
      counts: {
        all: allEntries.length,
        login: byCategory("login"),
        card: byCategory("card"),
        note: byCategory("note"),
        identity: byCategory("identity"),
      } as Record<Category, number>,
    };
  }, [allEntries, selectedCategory, search]);

  const selectedEntry = allEntries.find((e) => e.id === selectedEntryId) ?? null;

  // EntryForm displays save errors inline, so failures propagate to it and
  // the form stays open; success closes the form.
  const handleSave = (data: EntryData) =>
    Promise.resolve(
      editing && selectedEntry
        ? api.updateEntry({ ...data, id: selectedEntry.id })
        : api.createEntry(data),
    ).then(() => {
      setCreating(false);
      setEditing(false);
    });

  const handleDelete = (id: string) => {
    Promise.resolve(api.deleteEntry(id)).catch((err) => reportError(err, "Couldn't delete entry"));
    if (selectedEntryId === id) setSelectedEntryId(null);
  };

  const selectCategory = (cat: Category) => {
    setSelectedCategory(cat);
    setSelectedEntryId(null);
  };

  const emptyState =
    allEntries.length === 0 ? (
      <EmptyState
        icon={<KeyRound size={32} />}
        title="No passwords yet"
        description="Add your first password to get started"
        action={<Plus size={16} style={{ display: "inline", verticalAlign: "middle" }} />}
      />
    ) : (
      <EmptyState icon={<KeyRound size={32} />} title="No matches" />
    );

  return (
    <LessAppShell
      appName="Passwords"
      appIcon={<KeyRound size={22} color="var(--mantine-color-indigo-6)" />}
      banner={banner}
      navbar={
        <CategoriesSidebar selected={selectedCategory} onSelect={selectCategory} counts={counts} />
      }
      navbarWidth={240}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={syncStatus}
      syncError={syncError}
      onLogin={login}
      onLogout={logout}
    >
      {api.loading ? (
        <Box style={{ display: "grid", placeItems: "center", minHeight: 300 }}>
          <Loader />
        </Box>
      ) : creating ? (
        <EntryForm
          category={selectedCategory === "all" ? "login" : selectedCategory}
          onSave={handleSave}
          onCancel={() => setCreating(false)}
        />
      ) : editing && selectedEntry ? (
        <EntryForm entry={selectedEntry} onSave={handleSave} onCancel={() => setEditing(false)} />
      ) : selectedEntry ? (
        <EntryDetail
          entry={selectedEntry}
          personalSpaceId={sharing?.personalSpaceId}
          isAdmin={sharing ? sharing.isAdmin(selectedEntry._spaceId ?? null) : false}
          onEdit={() => setEditing(true)}
          onDelete={() => handleDelete(selectedEntry.id)}
          onBack={() => setSelectedEntryId(null)}
          onShare={
            sharing
              ? (handle) =>
                  sharing.shareEntry(selectedEntry, handle).then((newEntry) => {
                    if (newEntry && typeof newEntry === "object" && "id" in newEntry) {
                      setSelectedEntryId((newEntry as Spaced<Entry>).id);
                    }
                  })
              : undefined
          }
          onInvite={sharing ? (handle) => sharing.inviteToEntry(selectedEntry, handle) : undefined}
          onRemoveMember={
            sharing && selectedEntry._spaceId
              ? (did) => sharing.removeMember(selectedEntry._spaceId!, did)
              : undefined
          }
        />
      ) : (
        <EntryList
          entries={filtered}
          personalSpaceId={sharing?.personalSpaceId}
          search={search}
          onSearchChange={setSearch}
          onSelect={setSelectedEntryId}
          onCreate={() => setCreating(true)}
          emptyState={emptyState}
        />
      )}
    </LessAppShell>
  );
}
