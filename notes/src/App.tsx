import { useEffect, useMemo, useRef } from "react";
import { BetterbaseProvider, useConnectionStatus, useSync } from "betterbase/sync/react";
import { deleteTree } from "betterbase/sync";
import { useQuery } from "betterbase/db/react";
import { useAuth, SyncedAppGate, InvitationBanner, reportError } from "@betterbase/examples-shared";
import { db, notebooks, notes } from "@/lib/db";
import { useNotebooks } from "@/lib/sync";
import { NotesWorkspace, type NotesApi } from "@/components/NotesWorkspace";

// ---------------------------------------------------------------------------
// LocalNotesApp — offline-first, no sharing (unauthenticated path)
// ---------------------------------------------------------------------------

function LocalNotesApp() {
  const notebookResult = useQuery(notebooks, { sort: [{ field: "sortOrder", direction: "asc" }] });
  const allNotebooks = notebookResult?.records ?? [];
  const noteResult = useQuery(notes, { sort: [{ field: "updatedAt", direction: "desc" }] });
  const allNotes = noteResult?.records ?? [];

  const api = useMemo<NotesApi>(
    () => ({
      notebooks: allNotebooks,
      notes: allNotes,
      createNotebook: (name) => {
        const maxOrder = allNotebooks.reduce((max, nb) => Math.max(max, nb.sortOrder), 0);
        return db
          .put(notebooks, { name, sortOrder: maxOrder + 1 })
          .then(() => undefined)
          .catch((err) => {
            reportError(err, "Couldn't create notebook");
          });
      },
      deleteNotebook: (id) => deleteTree(db, notebooks, id).then(() => undefined),
      createNote: (notebookId) =>
        db
          .put(notes, {
            notebookId,
            title: "",
            body: "",
            pinned: false,
            favorite: false,
          })
          .then((record) => record.id),
      deleteNote: async (id) => {
        await db.delete(notes, id);
      },
    }),
    [allNotebooks, allNotes],
  );

  return <NotesWorkspace api={api} />;
}

// ---------------------------------------------------------------------------
// NotesApp — synced + sharing (authenticated path, inside BetterbaseProvider)
// ---------------------------------------------------------------------------

function NotesApp() {
  const { session } = useAuth();
  const { phase, error: syncError } = useSync();
  const syncStatus = useConnectionStatus();
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
    createNote,
    deleteNote,
  } = useNotebooks();

  // Auto-create a default notebook only after the full bootstrap sync completes.
  // phase === "ready" is true only after connect → pull → subscribe → pull, so
  // by then allNotebooks already reflects server data.
  useEffect(() => {
    if (phase === "ready" && allNotebooks.length === 0 && !autoCreated.current) {
      autoCreated.current = true;
      createNotebook("My Notebook");
    }
  }, [phase, allNotebooks.length, createNotebook]);

  const personalSpaceId = session?.getPersonalSpaceId() ?? null;

  const api = useMemo<NotesApi>(
    () => ({
      notebooks: allNotebooks,
      notes: allNotes,
      createNotebook,
      deleteNotebook,
      createNote: (notebookId, notebook) => createNote(notebookId, notebook).then((r) => r.id),
      deleteNote,
    }),
    [allNotebooks, allNotes, createNotebook, deleteNotebook, createNote, deleteNote],
  );

  const sharing = useMemo(
    () => ({
      personalSpaceId,
      isAdmin: (spaceId: string | null) => spaceId != null && isAdmin(spaceId),
      shareNotebook,
      inviteToNotebook,
      removeMember,
    }),
    [personalSpaceId, isAdmin, shareNotebook, inviteToNotebook, removeMember],
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
    <NotesWorkspace
      api={api}
      sharing={sharing}
      banner={banner}
      syncStatus={syncStatus}
      syncError={syncError ?? undefined}
    />
  );
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
        <SyncedAppGate>
          <NotesApp />
        </SyncedAppGate>
      </BetterbaseProvider>
    );
  }

  return <LocalNotesApp />;
}
