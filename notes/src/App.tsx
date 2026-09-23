import { useMemo } from "react";
import { BetterbaseProvider, useConnectionStatus, useSync } from "betterbase/sync/react";
import { deleteTree } from "betterbase/sync";
import { useQuery } from "betterbase/db/react";
import {
  useAuth,
  SyncedAppGate,
  InvitationBanner,
  reportError,
  accountScopeKey,
  useDbScope,
  DbScopeGate,
  runtimeDomain,
  useDefaultRecord,} from "@betterbase/examples-shared";
import {
  db,
  notebooks,
  notes,
  openDatabaseForScope,
  deleteAnonymousDatabase,
  DB_NAME,
} from "@/lib/db";
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

  // Auto-create a default notebook only after the full bootstrap sync
  // completes, and only when the collection verifiably reads empty from the
  // sync db — a reactive-query length check at ready-time races the post-pull
  // query propagation and duplicated the notebook on every reload.
  useDefaultRecord(
    phase === "ready",
    notebooks,
    (id) => createNotebook("My Notebook", id),
    "Couldn't create default notebook",
  );

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
  const {
    ready: dbReady,
    key: dbScopeKey,
    error: dbError,
  } = useDbScope(openDatabaseForScope, session ? accountScopeKey(session) : null);
  return (
    <DbScopeGate key={dbScopeKey} ready={dbReady} error={dbError}>
      {isAuthenticated && session ? (
        <BetterbaseProvider
          adapter={db}
          collections={[notebooks, notes]}
          session={session}
          clientId={clientId}
          domain={runtimeDomain()}
          onAuthError={logout}
        >
          <SyncedAppGate
            retireAnonymous={
              session
                ? {
                    appName: DB_NAME,
                    scopeKey: accountScopeKey(session),
                    deleteAnonymousDb: deleteAnonymousDatabase,
                  }
                : undefined
            }
          >
            <NotesApp />
          </SyncedAppGate>
        </BetterbaseProvider>
      ) : (
        <LocalNotesApp />
      )}
    </DbScopeGate>
  );
}
