import { useState, useEffect, useMemo, type ReactNode } from "react";
import { FileText, Plus } from "lucide-react";
import { Box, Button } from "@mantine/core";
import type { ConnectionStatus } from "betterbase/sync/react";
import { LessAppShell, useAuth, EmptyState, reportError } from "@betterbase/examples-shared";
import type { Note, Notebook } from "@/lib/db";
import { extractText, getExcerpt } from "@/lib/tiptap-text";
import { NotebookSidebar } from "./NotebookSidebar";
import { NoteList } from "./NoteList";
import { NoteEditor } from "./NoteEditor";

export type View = { kind: "all" } | { kind: "favorites" } | { kind: "notebook"; id: string };

type Spaced<T> = T & { _spaceId?: string };

/** Data + mutations the workspace needs, implemented by the local and synced adapters. */
export interface NotesApi {
  notebooks: readonly Spaced<Notebook>[];
  notes: readonly Spaced<Note>[];
  createNotebook: (name: string) => void | Promise<void>;
  deleteNotebook: (id: string) => void | Promise<void>;
  /** Creates a note in the given notebook (or the default) and resolves to its id. */
  createNote: (notebookId: string, notebook?: Spaced<Notebook>) => Promise<string> | string;
  deleteNote: (id: string) => void | Promise<void>;
}

/** Sharing surface — only provided by the synced adapter. */
export interface NotesSharing {
  personalSpaceId: string | null;
  isAdmin: (spaceId: string | null) => boolean;
  shareNotebook: (notebook: Spaced<Notebook>, handle: string) => Promise<unknown>;
  inviteToNotebook: (notebook: Spaced<Notebook>, handle: string) => Promise<void>;
  removeMember: (spaceId: string, did: string) => Promise<void>;
}

interface NotesWorkspaceProps {
  api: NotesApi;
  sharing?: NotesSharing;
  banner?: ReactNode;
  syncStatus?: ConnectionStatus;
  syncError?: string;
}

/**
 * The notes UI shared by the local (unauthenticated) and synced paths:
 * notebook sidebar, note list with search, and the editor.
 */
export function NotesWorkspace({
  api,
  sharing,
  banner,
  syncStatus,
  syncError,
}: NotesWorkspaceProps) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const [view, setView] = useState<View>({ kind: "all" });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { notebooks: allNotebooks, notes: allNotes } = api;

  // Drop notebook-scoped view when the notebook disappears (e.g. deleted or unshared)
  useEffect(() => {
    if (view.kind === "notebook" && !allNotebooks.find((nb) => nb.id === view.id)) {
      setView({ kind: "all" });
    }
  }, [view, allNotebooks]);

  // extractText JSON.parses each body, so memoize the whole pipeline — it runs
  // on every search keystroke otherwise.
  const { sortedNotes, noteCounts, excerpts } = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = allNotes.filter((n) => {
      if (view.kind === "favorites" && !n.favorite) return false;
      if (view.kind === "notebook" && n.notebookId !== view.id) return false;
      if (q) {
        return n.title.toLowerCase().includes(q) || extractText(n.body).toLowerCase().includes(q);
      }
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
    const counts = {
      all: allNotes.length,
      favorites: allNotes.filter((n) => n.favorite).length,
      byNotebook: Object.fromEntries(
        allNotebooks.map((nb) => [nb.id, allNotes.filter((n) => n.notebookId === nb.id).length]),
      ),
    };
    const excerptMap = new Map(allNotes.map((n) => [n.id, getExcerpt(n.body)]));
    return { sortedNotes: sorted, noteCounts: counts, excerpts: excerptMap };
  }, [allNotes, allNotebooks, view, search]);

  const selectedNote = allNotes.find((n) => n.id === selectedNoteId) ?? null;

  const changeView = (v: View) => {
    setView(v);
    setSelectedNoteId(null);
  };

  const createNote = () => {
    const notebookId = view.kind === "notebook" ? view.id : "";
    const notebook = allNotebooks.find((nb) => nb.id === notebookId);
    Promise.resolve(api.createNote(notebookId, notebook))
      .then((id) => setSelectedNoteId(id))
      .catch((err) => reportError(err, "Couldn't create note"));
  };

  const deleteNote = (id: string) => {
    Promise.resolve(api.deleteNote(id)).catch((err) => reportError(err, "Couldn't delete note"));
    if (selectedNoteId === id) setSelectedNoteId(null);
  };

  const selectedNotebook =
    view.kind === "notebook" ? (allNotebooks.find((nb) => nb.id === view.id) ?? null) : null;

  return (
    <LessAppShell
      appName="Notes"
      appIcon={<FileText size={22} color="var(--mantine-color-indigo-6)" />}
      banner={banner}
      navbar={
        <NotebookSidebar
          notebooks={allNotebooks}
          personalSpaceId={sharing?.personalSpaceId}
          view={view}
          onViewChange={changeView}
          onCreate={(name) =>
            Promise.resolve(api.createNotebook(name)).catch((err) =>
              reportError(err, "Couldn't create notebook"),
            )
          }
          onDelete={(id) =>
            Promise.resolve(api.deleteNotebook(id)).catch((err) =>
              reportError(err, "Couldn't delete notebook"),
            )
          }
          counts={noteCounts}
        />
      }
      navbarWidth={240}
      padding={0}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={syncStatus}
      syncError={syncError}
      onLogin={login}
      onLogout={logout}
    >
      {/* In-flow pane (not position:fixed — that covered the invitation banner).
          Fills the viewport below the header; a visible banner scrolls briefly. */}
      <Box
        style={{
          display: "flex",
          height: "calc(100dvh - var(--app-shell-header-offset, 60px))",
          overflow: "hidden",
        }}
      >
        <NoteList
          notes={sortedNotes}
          excerpts={excerpts}
          selectedNoteId={selectedNoteId}
          search={search}
          onSearchChange={setSearch}
          onSelect={setSelectedNoteId}
          onCreate={createNote}
          notebook={selectedNotebook}
          personalSpaceId={sharing?.personalSpaceId}
          isAdmin={sharing ? sharing.isAdmin(selectedNotebook?._spaceId ?? null) : false}
          onShare={
            sharing && selectedNotebook
              ? (handle) =>
                  sharing.shareNotebook(selectedNotebook, handle).then((newNotebook) => {
                    if (newNotebook && typeof newNotebook === "object" && "id" in newNotebook) {
                      changeView({
                        kind: "notebook",
                        id: (newNotebook as Spaced<Notebook>).id,
                      });
                    }
                  })
              : undefined
          }
          onInvite={
            sharing && selectedNotebook
              ? (handle) => sharing.inviteToNotebook(selectedNotebook, handle)
              : undefined
          }
          onRemoveMember={
            sharing && selectedNotebook?._spaceId
              ? (did) => sharing.removeMember(selectedNotebook._spaceId!, did)
              : undefined
          }
        />
        {selectedNote ? (
          <NoteEditor note={selectedNote} onDelete={deleteNote} />
        ) : allNotes.length === 0 && !search ? (
          // Global zero-note state (not view-filtered): an empty Favorites or
          // notebook view with notes elsewhere must not claim "no notes yet"
          <Box style={{ flex: 1, display: "grid", placeItems: "center" }}>
            <EmptyState
              icon={<FileText size={32} />}
              title="No notes yet"
              description="Create your first note to get started"
              action={
                <Button leftSection={<Plus size={16} />} size="xs" onClick={createNote}>
                  Create your first note
                </Button>
              }
            />
          </Box>
        ) : (
          <Box style={{ flex: 1, display: "grid", placeItems: "center" }}>
            <EmptyState
              icon={<FileText size={32} />}
              title="No note selected"
              description="Select a note from the list"
            />
          </Box>
        )}
      </Box>
    </LessAppShell>
  );
}
