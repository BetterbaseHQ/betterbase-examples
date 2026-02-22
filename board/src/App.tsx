import { useState, useEffect, useMemo, useRef } from "react";
import { Kanban } from "lucide-react";
import { LessProvider, useLessSync, useSyncReady } from "@betterbase/sdk/sync/react";
import { useQuery, useSyncStatus } from "@betterbase/sdk/db/react";
import {
  LessAppShell,
  useAuth,
  EmptyState,
  InvitationBanner,
  type SyncStatus,
} from "@betterbase/examples-shared";
import { db, boards, cards } from "@/lib/db";
import type { Board } from "@/lib/db";
import { useBoards } from "@/lib/sync";
import { BoardSidebar } from "@/components/BoardSidebar";
import { BoardView } from "@/components/BoardView";
import type { SpaceFields } from "@betterbase/sdk/sync";

// ---------------------------------------------------------------------------
// LocalBoardApp — offline-first, no sharing (unauthenticated path)
// ---------------------------------------------------------------------------

function LocalBoardApp() {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const { syncing, error: syncError } = useSyncStatus();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  const boardResult = useQuery(boards, {
    sort: [{ field: "createdAt", direction: "asc" }],
  });
  const allBoards = boardResult?.records ?? [];

  const cardResult = useQuery(cards, {
    sort: [{ field: "order", direction: "asc" }],
  });
  const allCards = cardResult?.records ?? [];

  const selectedBoard = allBoards.find((b) => b.id === selectedBoardId) ?? null;
  const boardCards = allCards.filter((c) => c.boardId === selectedBoardId);

  useEffect(() => {
    if (allBoards.length > 0 && !allBoards.find((b) => b.id === selectedBoardId)) {
      setSelectedBoardId(allBoards[0]!.id);
    }
  }, [allBoards, selectedBoardId]);

  const createBoard = (name: string) => {
    const defaultColumns = [
      { id: crypto.randomUUID(), name: "To Do" },
      { id: crypto.randomUUID(), name: "In Progress" },
      { id: crypto.randomUUID(), name: "Done" },
    ];
    db.put(boards, { name, columns: defaultColumns }).then((record) =>
      setSelectedBoardId(record.id),
    );
  };

  const deleteBoard = (id: string) => {
    if (!window.confirm("Delete this board and all its cards?")) return;
    allCards.filter((c) => c.boardId === id).forEach((c) => db.delete(cards, c.id));
    db.delete(boards, id);
    if (selectedBoardId === id) setSelectedBoardId(null);
  };

  const updateBoard = (
    id: string,
    patch: Partial<Omit<Board, "id" | "createdAt" | "updatedAt">>,
  ) => {
    db.patch(boards, { id, ...patch });
  };

  const cardCounts = useMemo(
    () =>
      Object.fromEntries(
        allBoards.map((b) => [b.id, allCards.filter((c) => c.boardId === b.id).length]),
      ),
    [allBoards, allCards],
  );

  const headerSyncStatus: SyncStatus | undefined = isAuthenticated
    ? syncError
      ? "error"
      : syncing
        ? "syncing"
        : "synced"
    : undefined;

  return (
    <LessAppShell
      appName="Less Board"
      appIcon={<Kanban size={22} color="var(--mantine-color-indigo-6)" />}
      navbar={
        <BoardSidebar
          boards={allBoards}
          selectedBoardId={selectedBoardId}
          onSelect={setSelectedBoardId}
          onCreate={createBoard}
          onDelete={deleteBoard}
          cardCounts={cardCounts}
        />
      }
      navbarWidth={200}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={headerSyncStatus}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      {selectedBoard ? (
        <BoardView board={selectedBoard} cards={boardCards} onUpdateBoard={updateBoard} />
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
          }}
        >
          <EmptyState
            icon={<Kanban size={32} />}
            title="No board selected"
            description="Select a board or create a new one"
          />
        </div>
      )}
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// BoardApp — synced + sharing (authenticated path, inside LessProvider)
// ---------------------------------------------------------------------------

function BoardApp({ personalSpaceId }: { personalSpaceId: string | null }) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const { phase, syncing, error: syncError } = useLessSync();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const autoCreated = useRef(false);

  const {
    boards: allBoards,
    cards: allCards,
    invitations,
    createBoard,
    deleteBoard,
    updateBoard,
    shareBoard,
    inviteToBoard,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
    addCard,
    deleteCards,
    moveCard,
  } = useBoards();

  // Auto-create a default board only after the full bootstrap sync completes.
  useEffect(() => {
    if (phase === "ready" && allBoards.length === 0 && !autoCreated.current) {
      autoCreated.current = true;
      createBoard("My Board");
    }
  }, [phase, allBoards.length, createBoard]);

  useEffect(() => {
    if (allBoards.length > 0 && !allBoards.find((b) => b.id === selectedBoardId)) {
      setSelectedBoardId(allBoards[0]!.id);
    }
  }, [allBoards, selectedBoardId]);

  const selectedBoard =
    (allBoards.find((b) => b.id === selectedBoardId) as
      | ((typeof allBoards)[number] & SpaceFields)
      | undefined) ?? null;
  const boardCards = allCards.filter((c) => c.boardId === selectedBoardId);

  const cardCounts = useMemo(
    () =>
      Object.fromEntries(
        allBoards.map((b) => [b.id, allCards.filter((c) => c.boardId === b.id).length]),
      ),
    [allBoards, allCards],
  );

  const handleDeleteBoard = async (id: string) => {
    if (!window.confirm("Delete this board and all its cards?")) return;
    await deleteBoard(id);
    if (selectedBoardId === id) setSelectedBoardId(null);
  };

  const handleAddCard = (
    _boardId: string,
    columnId: string,
    title: string,
    description: string,
    order: number,
  ) => {
    if (selectedBoard) addCard(selectedBoard, columnId, title, description, order);
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
      appName="Less Board"
      appIcon={<Kanban size={22} color="var(--mantine-color-indigo-6)" />}
      banner={banner}
      navbar={
        <BoardSidebar
          boards={allBoards}
          personalSpaceId={personalSpaceId}
          selectedBoardId={selectedBoardId}
          onSelect={setSelectedBoardId}
          onCreate={(name) => createBoard(name).then((r) => setSelectedBoardId(r.id))}
          onDelete={handleDeleteBoard}
          cardCounts={cardCounts}
        />
      }
      navbarWidth={200}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={syncError ? "error" : syncing ? "syncing" : "synced"}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      {selectedBoard ? (
        <BoardView
          board={selectedBoard}
          cards={boardCards}
          personalSpaceId={personalSpaceId}
          isAdmin={selectedBoard._spaceId ? isAdmin(selectedBoard._spaceId) : false}
          onUpdateBoard={updateBoard}
          onAddCard={handleAddCard}
          onDeleteColumnCards={deleteCards}
          onMoveCard={moveCard}
          onShare={(handle) =>
            shareBoard(selectedBoard, handle).then((newBoard) => setSelectedBoardId(newBoard.id))
          }
          onInvite={(handle) => inviteToBoard(selectedBoard, handle)}
          onRemoveMember={(did) =>
            selectedBoard._spaceId ? removeMember(selectedBoard._spaceId, did) : Promise.resolve()
          }
        />
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
          }}
        >
          <EmptyState
            icon={<Kanban size={32} />}
            title="No board selected"
            description="Select a board or create a new one"
          />
        </div>
      )}
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// SyncGuard — waits for LessContext to be ready before rendering BoardApp.
// ---------------------------------------------------------------------------

function SyncGuard({ personalSpaceId }: { personalSpaceId: string | null }) {
  const ready = useSyncReady();
  if (!ready) return null;
  return <BoardApp personalSpaceId={personalSpaceId} />;
}

// ---------------------------------------------------------------------------
// App — wraps BoardApp in LessProvider when authenticated
// ---------------------------------------------------------------------------

export default function App() {
  const { isAuthenticated, session, clientId, logout } = useAuth();
  if (isAuthenticated && session) {
    return (
      <LessProvider
        adapter={db}
        collections={[boards, cards]}
        session={session}
        clientId={clientId}
        domain={import.meta.env.VITE_DOMAIN || "localhost:5377"}
        onAuthError={logout}
      >
        <SyncGuard personalSpaceId={session.getPersonalSpaceId()} />
      </LessProvider>
    );
  }

  return <LocalBoardApp />;
}
