import { useState, useEffect, useRef } from "react";
import { CheckSquare, ListPlus } from "lucide-react";
import { LessProvider, useLessSync, useSyncReady } from "@betterbase/sdk/sync/react";
import { useQuery, useSyncStatus } from "@betterbase/sdk/db/react";
import {
  LessAppShell,
  useAuth,
  EmptyState,
  InvitationBanner,
  type SyncStatus,
} from "@betterbase/examples-shared";
import { db, lists } from "@/lib/db";
import { useLists } from "@/lib/sync";
import { TasksSidebar } from "@/components/TasksSidebar";
import { TaskList } from "@/components/TaskList";

// ---------------------------------------------------------------------------
// LocalTasksApp — offline-first, no sharing (unauthenticated path)
// ---------------------------------------------------------------------------

function LocalTasksApp() {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const { syncing, error: syncError } = useSyncStatus();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const autoCreated = useRef(false);

  const result = useQuery(lists, { sort: [{ field: "createdAt", direction: "asc" }] });
  const allLists = result?.records ?? [];

  useEffect(() => {
    if (result && result.records.length === 0 && !autoCreated.current) {
      autoCreated.current = true;
      db.put(lists, { name: "My Tasks", color: "indigo", todos: [] });
    }
  }, [result]);

  useEffect(() => {
    if (!selectedListId && allLists.length > 0) setSelectedListId(allLists[0]!.id);
  }, [selectedListId, allLists]);

  const selectedList = allLists.find((l) => l.id === selectedListId);
  useEffect(() => {
    if (selectedListId && !selectedList && allLists.length > 0) setSelectedListId(allLists[0]!.id);
  }, [selectedListId, selectedList, allLists]);

  const headerSyncStatus: SyncStatus | undefined = isAuthenticated
    ? syncError
      ? "error"
      : syncing
        ? "syncing"
        : "synced"
    : undefined;

  const addTodo = async (listId: string, text: string) => {
    const list = await db.get(lists, listId);
    if (!list) return;
    db.patch(lists, {
      id: listId,
      todos: [...list.todos, { id: crypto.randomUUID(), text, completed: false }],
    });
  };

  const toggleTodo = async (listId: string, todoId: string) => {
    const list = await db.get(lists, listId);
    if (!list) return;
    db.patch(lists, {
      id: listId,
      todos: list.todos.map((t) => (t.id === todoId ? { ...t, completed: !t.completed } : t)),
    });
  };

  const deleteTodo = async (listId: string, todoId: string) => {
    const list = await db.get(lists, listId);
    if (!list) return;
    db.patch(lists, { id: listId, todos: list.todos.filter((t) => t.id !== todoId) });
  };

  const createList = (name: string, color: string) => {
    db.put(lists, { name, color, todos: [] });
  };

  const deleteList = (id: string) => {
    db.delete(lists, id);
    if (selectedListId === id) setSelectedListId(null);
  };

  return (
    <LessAppShell
      appName="Less Tasks"
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
      syncStatus={headerSyncStatus}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      {selectedList ? (
        <TaskList
          list={selectedList}
          onAddTodo={addTodo}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
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
// TasksApp — synced + sharing (authenticated path, inside LessProvider)
// ---------------------------------------------------------------------------

function TasksApp({ personalSpaceId }: { personalSpaceId: string | null }) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const { phase, syncing, error: syncError } = useLessSync();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const autoCreated = useRef(false);

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
    addTodo,
    toggleTodo,
    deleteTodo,
  } = useLists();

  // Auto-create a default list only after the full bootstrap sync completes.
  // phase === "ready" is true only after connect → pull → subscribe → pull, so
  // by then allLists already reflects server data. syncReady (LessContext
  // populated) is not sufficient — the IDB query starts empty and fills in async.
  useEffect(() => {
    if (phase === "ready" && allLists.length === 0 && !autoCreated.current) {
      autoCreated.current = true;
      createList("My Tasks", "indigo");
    }
  }, [phase, allLists.length, createList]);

  useEffect(() => {
    if (!selectedListId && allLists.length > 0) setSelectedListId(allLists[0]!.id);
  }, [selectedListId, allLists]);

  const selectedList = allLists.find((l) => l.id === selectedListId);
  useEffect(() => {
    if (selectedListId && !selectedList && allLists.length > 0) setSelectedListId(allLists[0]!.id);
  }, [selectedListId, selectedList, allLists]);

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
      appName="Less Tasks"
      appIcon={<CheckSquare size={22} color="var(--mantine-color-indigo-6)" />}
      banner={banner}
      navbar={
        <TasksSidebar
          lists={allLists}
          personalSpaceId={personalSpaceId}
          selectedListId={selectedListId}
          onSelect={setSelectedListId}
          onCreate={createList}
          onDelete={(id) => {
            if (selectedListId === id) setSelectedListId(null);
            deleteList(id);
          }}
        />
      }
      navbarWidth={280}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={syncError ? "error" : syncing ? "syncing" : "synced"}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      {selectedList ? (
        <TaskList
          list={selectedList}
          personalSpaceId={personalSpaceId}
          isAdmin={isAdmin(selectedList._spaceId)}
          onAddTodo={addTodo}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
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
// SyncGuard — waits for LessContext to be ready before rendering TasksApp.
// LessProvider always renders children immediately but LessContext is null
// until async session key derivation completes. All useLists hooks throw on
// a null context, so we gate here rather than inside each hook.
// ---------------------------------------------------------------------------

function SyncGuard({ personalSpaceId }: { personalSpaceId: string | null }) {
  const ready = useSyncReady();
  if (!ready) return null;
  return <TasksApp personalSpaceId={personalSpaceId} />;
}

// ---------------------------------------------------------------------------
// App — wraps TasksApp in LessProvider when authenticated
// ---------------------------------------------------------------------------

export default function App() {
  const { isAuthenticated, session, clientId, logout } = useAuth();
  if (isAuthenticated && session) {
    return (
      <LessProvider
        adapter={db}
        collections={[lists]}
        session={session}
        clientId={clientId}
        domain={import.meta.env.VITE_DOMAIN || "localhost:5377"}
        onAuthError={logout}
      >
        <SyncGuard personalSpaceId={session.getPersonalSpaceId()} />
      </LessProvider>
    );
  }

  return <LocalTasksApp />;
}
