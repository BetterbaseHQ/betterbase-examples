import { useState, useEffect, useMemo } from "react";
import { CheckSquare, ListPlus } from "lucide-react";
import { useConnectionStatus, useSync } from "betterbase/sync/react";
import { useQuery } from "betterbase/db/react";
import {
  LessAppShell,
  useAuth,
  EmptyState,
  InvitationBanner,
  reportError,
  ScopedAppTree,
} from "@betterbase/examples-shared";
import { db, lists, openDatabaseForScope, deleteAnonymousDatabase, DB_NAME } from "@/lib/db";
import { useLists } from "@/lib/sync";
import { createTodoOps } from "@/lib/todos";
import { TasksSidebar } from "@/components/TasksSidebar";
import { TaskList } from "@/components/TaskList";

// ---------------------------------------------------------------------------
// LocalTasksApp — offline-first, no sharing (unauthenticated path)
// ---------------------------------------------------------------------------

function LocalTasksApp() {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  // Per mount, not module level: the component lives inside the
  // scope-keyed subtree, so this always captures the CURRENT database
  // (the module binding swaps on scope changes — a module-level capture
  // would write into a closed instance after a login/logout cycle).
  const localTodoOps = useMemo(() => createTodoOps(db), []);

  const result = useQuery(lists, { sort: [{ field: "createdAt", direction: "asc" }] });
  const allLists = result?.records ?? [];

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
  const { error: syncError } = useSync();
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
  return (
    <ScopedAppTree
      appName={DB_NAME}
      collections={[lists]}
      openDatabaseForScope={openDatabaseForScope}
      deleteAnonymousDatabase={deleteAnonymousDatabase}
      getDb={() => db}
      local={<LocalTasksApp />}
    >
      {(session) => <TasksApp personalSpaceId={session.getPersonalSpaceId()} />}
    </ScopedAppTree>
  );
}
