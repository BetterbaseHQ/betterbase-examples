import { useState, useEffect, useCallback, useRef } from "react";
import { FileText } from "lucide-react";
import { BetterbaseProvider, useSync, useSyncReady } from "betterbase/sync/react";
import { useQuery, useSyncStatus } from "betterbase/db/react";
import {
  LessAppShell,
  useAuth,
  EmptyState,
  InvitationBanner,
  type SyncStatus,
} from "@betterbase/examples-shared";
import { db, notebooks, notes } from "@/lib/db";
import type { Note } from "@/lib/db";
import { useNotebooks } from "@/lib/sync";
import { NotebookSidebar } from "@/components/NotebookSidebar";
import { NoteList } from "@/components/NoteList";
import { NoteEditor } from "@/components/NoteEditor";
import type { SpaceFields } from "betterbase/sync";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractText(body: string): string {
  if (!body) return "";
  try {
    const doc = JSON.parse(body);
    const texts: string[] = [];
    function walk(node: { text?: string; content?: unknown[] }) {
      if (node.text) texts.push(node.text);
      if (node.content) (node.content as (typeof node)[]).forEach(walk);
    }
    walk(doc);
    return texts.join(" ");
  } catch {
    return body;
  }
}

// ---------------------------------------------------------------------------
// View types for sidebar navigation
// ---------------------------------------------------------------------------

type View = { kind: "all" } | { kind: "favorites" } | { kind: "notebook"; id: string };

// ---------------------------------------------------------------------------
// LocalNotesApp — offline-first, no sharing (unauthenticated path)
// ---------------------------------------------------------------------------

function LocalNotesApp() {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const { syncing, error: syncError } = useSyncStatus();
  const [view, setView] = useState<View>({ kind: "all" });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const notebookResult = useQuery(notebooks, {
    sort: [{ field: "sortOrder", direction: "asc" }],
  });
  const allNotebooks = notebookResult?.records ?? [];

  const noteResult = useQuery(notes, {
    sort: [{ field: "updatedAt", direction: "desc" }],
  });
  const allNotes = noteResult?.records ?? [];

  const filteredNotes = allNotes.filter((n) => {
    if (view.kind === "favorites" && !n.favorite) return false;
    if (view.kind === "notebook" && n.notebookId !== view.id) return false;
    if (search) {
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || extractText(n.body).toLowerCase().includes(q);
    }
    return true;
  });

  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  const selectedNote = allNotes.find((n) => n.id === selectedNoteId) ?? null;

  useEffect(() => {
    if (view.kind === "notebook" && !allNotebooks.find((nb) => nb.id === view.id)) {
      setView({ kind: "all" });
    }
  }, [view, allNotebooks]);

  const createNotebook = useCallback(
    (name: string) => {
      const maxOrder = allNotebooks.reduce((max, nb) => Math.max(max, nb.sortOrder), 0);
      db.put(notebooks, { name, sortOrder: maxOrder + 1 });
    },
    [allNotebooks],
  );

  const deleteNotebook = useCallback(
    (id: string) => {
      allNotes.filter((n) => n.notebookId === id).forEach((n) => db.delete(notes, n.id));
      db.delete(notebooks, id);
      if (view.kind === "notebook" && view.id === id) setView({ kind: "all" });
    },
    [allNotes, view],
  );

  const createNote = useCallback(() => {
    const notebookId = view.kind === "notebook" ? view.id : "";
    db.put(notes, {
      notebookId,
      title: "",
      body: "",
      pinned: false,
      favorite: false,
    }).then((record) => setSelectedNoteId(record.id));
  }, [view]);

  const updateNote = useCallback(
    (id: string, patch: Partial<Omit<Note, "id" | "createdAt" | "updatedAt">>) => {
      db.patch(notes, { id, ...patch });
    },
    [],
  );

  const deleteNote = useCallback(
    (id: string) => {
      db.delete(notes, id);
      if (selectedNoteId === id) setSelectedNoteId(null);
    },
    [selectedNoteId],
  );

  const noteCounts = {
    all: allNotes.length,
    favorites: allNotes.filter((n) => n.favorite).length,
    byNotebook: Object.fromEntries(
      allNotebooks.map((nb) => [nb.id, allNotes.filter((n) => n.notebookId === nb.id).length]),
    ),
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
      appName="Less Notes"
      appIcon={<FileText size={22} color="var(--mantine-color-indigo-6)" />}
      navbar={
        <NotebookSidebar
          notebooks={allNotebooks}
          view={view}
          onViewChange={(v) => {
            setView(v);
            setSelectedNoteId(null);
          }}
          onCreate={createNotebook}
          onDelete={deleteNotebook}
          counts={noteCounts}
        />
      }
      navbarWidth={240}
      padding={0}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={headerSyncStatus}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      <div
        style={{
          position: "fixed",
          top: "var(--app-shell-header-offset, 0px)",
          left: "var(--app-shell-navbar-offset, 0px)",
          right: 0,
          bottom: 0,
          display: "flex",
        }}
      >
        <NoteList
          notes={sortedNotes}
          selectedNoteId={selectedNoteId}
          search={search}
          onSearchChange={setSearch}
          onSelect={setSelectedNoteId}
          onCreate={createNote}
        />
        {selectedNote ? (
          <NoteEditor note={selectedNote} onUpdate={updateNote} onDelete={deleteNote} />
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <EmptyState
              icon={<FileText size={32} />}
              title="No note selected"
              description="Select a note or create a new one"
            />
          </div>
        )}
      </div>
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// NotesApp — synced + sharing (authenticated path, inside BetterbaseProvider)
// ---------------------------------------------------------------------------

function NotesApp({ personalSpaceId }: { personalSpaceId: string | null }) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const { phase, syncing, error: syncError } = useSync();
  const [view, setView] = useState<View>({ kind: "all" });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const autoCreated = useRef(false);

  const {
    notebooks: allNotebooks,
    notes: allNotes,
    invitations,
    createNotebook,
    deleteNotebook,
    shareNotebook,
    inviteToNotebook,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
    createNote: hookCreateNote,
    updateNote,
    deleteNote: hookDeleteNote,
  } = useNotebooks();

  // Auto-create a default notebook only after the full bootstrap sync completes.
  useEffect(() => {
    if (phase === "ready" && allNotebooks.length === 0 && !autoCreated.current) {
      autoCreated.current = true;
      createNotebook("My Notebook");
    }
  }, [phase, allNotebooks.length, createNotebook]);

  useEffect(() => {
    if (view.kind === "notebook" && !allNotebooks.find((nb) => nb.id === view.id)) {
      setView({ kind: "all" });
    }
  }, [view, allNotebooks]);

  const filteredNotes = allNotes.filter((n) => {
    if (view.kind === "favorites" && !n.favorite) return false;
    if (view.kind === "notebook" && n.notebookId !== view.id) return false;
    if (search) {
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || extractText(n.body).toLowerCase().includes(q);
    }
    return true;
  });

  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  const selectedNote = allNotes.find((n) => n.id === selectedNoteId) ?? null;

  const createNote = useCallback(() => {
    const notebookId = view.kind === "notebook" ? view.id : "";
    const notebook = allNotebooks.find((nb) => nb.id === notebookId) as
      | ((typeof allNotebooks)[number] & SpaceFields)
      | undefined;
    hookCreateNote(notebookId, notebook).then((record) => setSelectedNoteId(record.id));
  }, [view, allNotebooks, hookCreateNote]);

  const handleDeleteNotebook = useCallback(
    async (id: string) => {
      await deleteNotebook(id);
      if (view.kind === "notebook" && view.id === id) setView({ kind: "all" });
    },
    [deleteNotebook, view],
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      await hookDeleteNote(id);
      if (selectedNoteId === id) setSelectedNoteId(null);
    },
    [hookDeleteNote, selectedNoteId],
  );

  const selectedNotebook =
    view.kind === "notebook"
      ? ((allNotebooks.find((nb) => nb.id === view.id) as
          | ((typeof allNotebooks)[number] & SpaceFields)
          | undefined) ?? null)
      : null;

  const noteCounts = {
    all: allNotes.length,
    favorites: allNotes.filter((n) => n.favorite).length,
    byNotebook: Object.fromEntries(
      allNotebooks.map((nb) => [nb.id, allNotes.filter((n) => n.notebookId === nb.id).length]),
    ),
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
      appName="Less Notes"
      appIcon={<FileText size={22} color="var(--mantine-color-indigo-6)" />}
      banner={banner}
      navbar={
        <NotebookSidebar
          notebooks={allNotebooks}
          personalSpaceId={personalSpaceId}
          view={view}
          onViewChange={(v) => {
            setView(v);
            setSelectedNoteId(null);
          }}
          onCreate={createNotebook}
          onDelete={handleDeleteNotebook}
          counts={noteCounts}
        />
      }
      navbarWidth={240}
      padding={0}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={syncError ? "error" : syncing ? "syncing" : "synced"}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      <div
        style={{
          position: "fixed",
          top: "var(--app-shell-header-offset, 0px)",
          left: "var(--app-shell-navbar-offset, 0px)",
          right: 0,
          bottom: 0,
          display: "flex",
        }}
      >
        <NoteList
          notes={sortedNotes}
          selectedNoteId={selectedNoteId}
          search={search}
          onSearchChange={setSearch}
          onSelect={setSelectedNoteId}
          onCreate={createNote}
          notebook={selectedNotebook}
          personalSpaceId={personalSpaceId}
          isAdmin={selectedNotebook?._spaceId ? isAdmin(selectedNotebook._spaceId) : false}
          onShare={
            selectedNotebook
              ? async (handle) => {
                  const newNotebook = await shareNotebook(selectedNotebook, handle);
                  setView({ kind: "notebook", id: newNotebook.id });
                  setSelectedNoteId(null);
                }
              : undefined
          }
          onInvite={
            selectedNotebook ? (handle) => inviteToNotebook(selectedNotebook, handle) : undefined
          }
          onRemoveMember={
            selectedNotebook?._spaceId
              ? (did) => removeMember(selectedNotebook._spaceId!, did)
              : undefined
          }
        />
        {selectedNote ? (
          <NoteEditor note={selectedNote} onUpdate={updateNote} onDelete={handleDeleteNote} />
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <EmptyState
              icon={<FileText size={32} />}
              title="No note selected"
              description="Select a note or create a new one"
            />
          </div>
        )}
      </div>
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// SyncGuard — waits for LessContext to be ready before rendering NotesApp.
// ---------------------------------------------------------------------------

function SyncGuard({ personalSpaceId }: { personalSpaceId: string | null }) {
  const ready = useSyncReady();
  if (!ready) return null;
  return <NotesApp personalSpaceId={personalSpaceId} />;
}

// ---------------------------------------------------------------------------
// App — wraps NotesApp in BetterbaseProvider when authenticated
// ---------------------------------------------------------------------------

export default function App() {
  const { isAuthenticated, session, clientId, logout } = useAuth();
  if (isAuthenticated && session) {
    return (
      <BetterbaseProvider
        adapter={db}
        collections={[notebooks, notes]}
        session={session}
        clientId={clientId}
        domain={import.meta.env.VITE_DOMAIN || "localhost:5377"}
        onAuthError={logout}
      >
        <SyncGuard personalSpaceId={session.getPersonalSpaceId()} />
      </BetterbaseProvider>
    );
  }

  return <LocalNotesApp />;
}
