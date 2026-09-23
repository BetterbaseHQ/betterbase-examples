import { useState, useEffect, useRef } from "react";
import { CheckSquare, ListPlus } from "lucide-react";
import { BetterbaseProvider, useConnectionStatus, useSync } from "betterbase/sync/react";
import { useQuery } from "betterbase/db/react";
import {
  LessAppShell,
  SyncedAppGate,
  useAuth,
  EmptyState,
  InvitationBanner,
  reportError,
  accountScopeKey,
  useDbScope,
  DbScopeGate,
  runtimeDomain,
  useDefaultRecord,
} from "@betterbase/examples-shared";
import { db, lists, openDatabaseForScope } from "@/lib/db";
import { useLists } from "@/lib/sync";
import { createTodoOps } from "@/lib/todos";
import { TasksSidebar } from "@/components/TasksSidebar";
import { TaskList } from "@/components/TaskList";

// Local path writes go straight to the module db (no sync adapter).
const localTodoOps = createTodoOps(db);

// ---------------------------------------------------------------------------
// LocalTasksApp — offline-first, no sharing (unauthenticated path)
// ---------------------------------------------------------------------------

function LocalTasksApp() {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const autoCreated = useRef(false);

  const result = useQuery(lists, { sort: [{ field: "createdAt", direction: "asc" }] });
  const allLists = result?.records ?? [];

  useEffect(() => {
    if (result && result.records.length === 0 && !autoCreated.current) {
      autoCreated.current = true;
      db.put(lists, { name: "My Tasks", color: "indigo", todos: [] }).catch((err) =>
        reportError(err, "Couldn't create default list"),
      );
    }
  }, [result]);

  const [firstList] = allLists;
  useEffect(() => {
    if (!selectedListId && firstList) setSelectedListId(firstList.id);
  }, [selectedListId, firstList]);

  const selectedList = allLists.find((l) => l.id === selectedListId);
  useEffect(() => {
    if (selectedListId && !selectedList && firstList) setSelectedListId(firstList.id);
  }, [selectedListId, selectedList, firstList]);

  const createList = (name: string, color: string) => {
    db.put(lists, { name, color, todos: [] }).catch((err) =>
      reportError(err, "Couldn't create list"),
    );
  };

  const deleteList = (id: string) => {
    db.delete(lists, id).catch((err) => reportError(err, "Couldn't delete list"));
    if (selectedListId === id) setSelectedListId(null);
  };

  return (
    <LessAppShell
      appName="Tasks"
      appIcon={<CheckSquare size={22} color="var(--mantine-color-indigo-6)" />}
      navbar={
        <TasksSidebar
          lists={allLists}
          selectedListId={selectedListId}
          onSelect={setSelectedListId}
          onCreate={createList}
          onDelete={deleteList}
        />
      }
      navbarWidth={280}
      isAuthenticated={isAuthenticated}
      handle={handle}
      onLogin={login}
      onLogout={logout}
    >
      {selectedList ? (
        <TaskList
          list={selectedList}
          onAddTodo={localTodoOps.addTodo}
          onToggleTodo={localTodoOps.toggleTodo}
          onDeleteTodo={localTodoOps.deleteTodo}
        />
      ) : (
        <EmptyState
          icon={<ListPlus size={32} />}
          title="No list selected"
          description="Create a list to get started"
        />
      )}
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// TasksApp — synced + sharing (authenticated path, inside BetterbaseProvider)
// ---------------------------------------------------------------------------

function TasksApp({ personalSpaceId }: { personalSpaceId: string | null }) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const { phase, error: syncError } = useSync();
  const syncStatus = useConnectionStatus();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const {
    lists: allLists,
    invitations,
    createList,
    deleteList,
    shareList,
    inviteToList,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
    todoOps,
  } = useLists();

  // Auto-create a default list only after the full bootstrap sync completes,
  // and only when the collection verifiably reads empty from the sync db —
  // a reactive-query length check at ready-time races the post-pull query
  // propagation and duplicated the list on every reload.
  useDefaultRecord(
    phase === "ready",
    lists,
    () => createList("My Tasks", "indigo"),
    "Couldn't create default list",
  );

  const [firstList] = allLists;
  useEffect(() => {
    if (!selectedListId && firstList) setSelectedListId(firstList.id);
  }, [selectedListId, firstList]);

  const selectedList = allLists.find((l) => l.id === selectedListId);
  useEffect(() => {
    if (selectedListId && !selectedList && firstList) setSelectedListId(firstList.id);
  }, [selectedListId, selectedList, firstList]);

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
      appName="Tasks"
      appIcon={<CheckSquare size={22} color="var(--mantine-color-indigo-6)" />}
      banner={banner}
      navbar={
        <TasksSidebar
          lists={allLists}
          personalSpaceId={personalSpaceId}
          selectedListId={selectedListId}
          onSelect={setSelectedListId}
          onCreate={(name, color) =>
            createList(name, color).catch((err) => reportError(err, "Couldn't create list"))
          }
          onDelete={(id) => {
            if (selectedListId === id) setSelectedListId(null);
            deleteList(id).catch((err) => reportError(err, "Couldn't delete list"));
          }}
        />
      }
      navbarWidth={280}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={syncStatus}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      {selectedList ? (
        <TaskList
          list={selectedList}
          personalSpaceId={personalSpaceId}
          isAdmin={isAdmin(selectedList._spaceId)}
          onAddTodo={todoOps.addTodo}
          onToggleTodo={todoOps.toggleTodo}
          onDeleteTodo={todoOps.deleteTodo}
          onShare={(handle) =>
            shareList(selectedList, handle).then((newList) => setSelectedListId(newList.id))
          }
          onInvite={(handle) => inviteToList(selectedList, handle)}
          onRemoveMember={(did) =>
            selectedList._spaceId ? removeMember(selectedList._spaceId, did) : Promise.resolve()
          }
        />
      ) : (
        <EmptyState
          icon={<ListPlus size={32} />}
          title="No list selected"
          description="Create a list to get started"
        />
      )}
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// App — wraps TasksApp in BetterbaseProvider when authenticated
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
          collections={[lists]}
          session={session}
          clientId={clientId}
          domain={runtimeDomain()}
          onAuthError={logout}
        >
          <SyncedAppGate>
            <TasksApp personalSpaceId={session.getPersonalSpaceId()} />
          </SyncedAppGate>
        </BetterbaseProvider>
      ) : (
        <LocalTasksApp />
      )}
    </DbScopeGate>
  );
}
