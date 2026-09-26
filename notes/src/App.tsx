import { useMemo } from "react";
import { useConnectionStatus, useSync, useSpaceStatus } from "betterbase/sync/react";
import { deleteTree } from "betterbase/sync";
import { useQuery } from "betterbase/db/react";
import { InvitationBanner, ScopedAppTree, reportError, useAuth } from "@betterbase/examples-shared";
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

// Module-level so it can be passed as a stable hook into the workspace's
// probe seam (called unconditionally every render — rules-of-hooks safe).
function useRemovedNotebookSpace(spaceId: string | null) {
  const { status, name } = useSpaceStatus(spaceId ?? undefined);
  return { removed: status === "removed", name };
}

function NotesApp() {
  const { session } = useAuth();
  const { error: syncError } = useSync();
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
      useRemovedSpace: useRemovedNotebookSpace,
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
  return (
    <ScopedAppTree
      appName={DB_NAME}
      collections={[notebooks, notes]}
      openDatabaseForScope={openDatabaseForScope}
      deleteAnonymousDatabase={deleteAnonymousDatabase}
      getDb={() => db}
      local={<LocalNotesApp />}
    >
      {() => <NotesApp />}
    </ScopedAppTree>
  );
}
