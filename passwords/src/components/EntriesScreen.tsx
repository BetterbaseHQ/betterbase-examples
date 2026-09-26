import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { KeyRound, Plus } from "lucide-react";
import { Box, Button, Loader } from "@mantine/core";
import {
  LessAppShell,
  useAuth,
  EmptyState,
  reportError,
  RemovedSpaceNotice,
} from "@betterbase/examples-shared";
import type { ConnectionStatus } from "betterbase/sync/react";
import { useEditableRecord } from "betterbase/db/react";
import type { Entry } from "@/lib/db";
import { entries } from "@/lib/db";
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
  /**
   * `base` is the CRDT snapshot the edit session started from (when known) —
   * patching against it merges concurrent peer edits instead of
   * overwriting them with the form's stale full values.
   */
  updateEntry: (data: EntryData & { id: string }, base?: Uint8Array | null) => Promise<void> | void;
  deleteEntry: (id: string) => Promise<void> | void;
}

/** Reactive probe injected by the synced path (local path stays inert). */
export type RemovedSpaceProbe = (spaceId: string | null) => {
  removed: boolean;
  name: string | null;
};

const noRemovedSpaces: RemovedSpaceProbe = () => ({ removed: false, name: null });

export interface EntriesSharing {
  personalSpaceId: string | null;
  isAdmin: (spaceId: string | null) => boolean;
  shareEntry: (entry: Spaced<Entry>, handle: string) => Promise<unknown>;
  inviteToEntry: (entry: Spaced<Entry>, handle: string) => Promise<void>;
  removeMember: (spaceId: string, did: string) => Promise<void>;
  /** Hook: is this entry's space one the user was removed from? */
  useRemovedSpace: RemovedSpaceProbe;
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
  const [deletingLocalCopy, setDeletingLocalCopy] = useState(false);

  // Called as a hook every render (stable identity per app path), so the
  // probe must be invoked unconditionally — the local path passes the inert
  // no-op above. The `use`-prefixed alias makes eslint's rules-of-hooks
  // own that invariant.
  const useRemovedSpace = sharing?.useRemovedSpace ?? noRemovedSpaces;

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
  const removedSpace = useRemovedSpace(selectedEntry?._spaceId ?? null);

  // Atomic record+base for the selected entry. EntryForm initializes from
  // `record` (not the query hit) so its values and the captured base come
  // from the same delivery generation — anchoring the eventual save to
  // exactly the version the form was populated from. The query hit remains
  // the source for `_spaceId` (sharing) and the detail view.
  const { record: liveSelected, base } = useEditableRecord(entries, selectedEntryId ?? undefined);
  const baseRef = useRef<Uint8Array | null>(null);
  baseRef.current = base;
  const editBaseRef = useRef<Uint8Array | null>(null);

  // EntryForm displays save errors inline, so failures propagate to it and
  // the form stays open; success closes the form.
  const handleSave = (data: EntryData) =>
    Promise.resolve(
      editing && selectedEntry
        ? api.updateEntry({ ...data, id: selectedEntry.id }, editBaseRef.current)
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
        action={
          <Button leftSection={<Plus size={16} />} size="xs" onClick={() => setCreating(true)}>
            Add your first password
          </Button>
        }
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
      ) : editing && selectedEntry && !removedSpace.removed ? (
        <EntryForm
          entry={liveSelected ?? selectedEntry}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      ) : selectedEntry && removedSpace.removed ? (
        <RemovedSpaceNotice
          kindLabel="password"
          name={removedSpace.name}
          deleting={deletingLocalCopy}
          onDeleteLocalCopy={() => {
            setDeletingLocalCopy(true);
            Promise.resolve(api.deleteEntry(selectedEntry.id))
              .catch((err) => reportError(err, "Couldn't delete local copy"))
              .finally(() => setDeletingLocalCopy(false));
          }}
        />
      ) : selectedEntry ? (
        <EntryDetail
          entry={selectedEntry}
          personalSpaceId={sharing?.personalSpaceId}
          isAdmin={sharing ? sharing.isAdmin(selectedEntry._spaceId ?? null) : false}
          onEdit={() => {
            editBaseRef.current = baseRef.current;
            setEditing(true);
          }}
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
