import { useState, useEffect, useMemo } from "react";
import { Kanban } from "lucide-react";
import { useConnectionStatus, useSync } from "betterbase/sync/react";
import { deleteTree } from "betterbase/sync";
import { useQuery } from "betterbase/db/react";
import {
  CreateFirstItem,
  EmptyState,
  InvitationBanner,
  LessAppShell,
  ScopedAppTree,
  reportError,
  useAuth,
} from "@betterbase/examples-shared";
import {
  db,
  boards,
  columns,
  cards,
  openDatabaseForScope,
  deleteAnonymousDatabase,
  DB_NAME,
} from "@/lib/db";
import { useBoards } from "@/lib/sync";
import { createBoardIn } from "@/lib/create-board";
import { BoardSidebar } from "@/components/BoardSidebar";
import { BoardView } from "@/components/BoardView";

/** Board creation on the module (anonymous) db — see lib/create-board. */
export async function createBoardWithColumns(name: string) {
  return createBoardIn(db, name);
}

// ---------------------------------------------------------------------------
// LocalBoardApp — offline-first, no sharing (unauthenticated path)
// ---------------------------------------------------------------------------

function LocalBoardApp() {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  const boardResult = useQuery(boards, {
    sort: [
      { field: "createdAt", direction: "asc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allBoards = boardResult?.records ?? [];
  // The query hook is undefined until its first emission — a populated
  // workspace must not flash the first-run CTA while loading.
  const boardsLoaded = boardResult !== undefined;

  const columnResult = useQuery(columns, {
    sort: [
      { field: "sortOrder", direction: "asc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allColumns = columnResult?.records ?? [];

  const cardResult = useQuery(cards, {
    sort: [
      { field: "order", direction: "asc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allCards = cardResult?.records ?? [];

  const selectedBoard = allBoards.find((b) => b.id === selectedBoardId) ?? null;
  const boardColumns = allColumns.filter((c) => c.boardId === selectedBoardId);
  const boardCards = allCards.filter((c) => c.boardId === selectedBoardId);

  useEffect(() => {
    if (allBoards.length > 0 && !allBoards.find((b) => b.id === selectedBoardId)) {
      setSelectedBoardId(allBoards[0]!.id);
    }
  }, [allBoards, selectedBoardId]);

  const createBoardAndSelect = (name: string) =>
    createBoardWithColumns(name).then((record) => setSelectedBoardId(record.id));
  const createBoard = (name: string) => {
    createBoardAndSelect(name).catch((err) => reportError(err, "Couldn't create board"));
  };
  const deleteBoard = (id: string) => {
    // Cascade covers columns and cards (declared parent edges).
    deleteTree(db, boards, id).catch((err) => reportError(err, "Couldn't delete board"));
    if (selectedBoardId === id) setSelectedBoardId(null);
  };

  const addColumn = (name: string) => {
    if (!selectedBoardId) return;
    const boardColumns = allColumns.filter((c) => c.boardId === selectedBoardId);
    const maxOrder = boardColumns.reduce((max, c) => Math.max(max, c.sortOrder), 0);
    db.put(columns, { boardId: selectedBoardId, name, sortOrder: maxOrder + 1 }).catch((err) =>
      reportError(err, "Couldn't add column"),
    );
  };

  const renameColumn = (columnId: string, name: string) => {
    db.patch(columns, { id: columnId, name }).catch((err) =>
      reportError(err, "Couldn't rename column"),
    );
  };

  const deleteColumn = (columnId: string) => {
    // AUD-054: delete through the gated cascade — cards are discovered
    // from the db (not render state, which can omit a just-committed
    // card) and removed deepest-first, and the column is only deleted
    // once they are all gone. Firing child deletes individually and the
    // column unconditionally left a failed card orphaned under a deleted
    // column, unreachable in the UI.
    deleteTree(db, columns, columnId).catch((err) => reportError(err, "Couldn't delete column"));
  };

  const cardCounts = useMemo(
    () =>
      Object.fromEntries(
        allBoards.map((b) => [b.id, allCards.filter((c) => c.boardId === b.id).length]),
      ),
    [allBoards, allCards],
  );

  return (
    <LessAppShell
      appName="Board"
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
      onLogin={login}
      onLogout={logout}
    >
      {selectedBoard ? (
        <BoardView
          board={selectedBoard}
          columns={boardColumns}
          cards={boardCards}
          onAddColumn={addColumn}
          onRenameColumn={renameColumn}
          onDeleteColumn={deleteColumn}
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
            title={boardsLoaded && allBoards.length === 0 ? "No boards yet" : "No board selected"}
            description={
              boardsLoaded && allBoards.length === 0
                ? "Create your first board to get started."
                : "Create a board to get started"
            }
            action={
              boardsLoaded && allBoards.length === 0 ? (
                <CreateFirstItem
                  noun="board"
                  helperText="Starts with To Do, In Progress, and Done columns."
                  onCreate={createBoardAndSelect}
                />
              ) : undefined
            }
          />
        </div>
      )}
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// BoardApp — synced + sharing (authenticated path, inside BetterbaseProvider)
// ---------------------------------------------------------------------------

function BoardApp({ personalSpaceId }: { personalSpaceId: string | null }) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const { error: syncError } = useSync();
  const syncStatus = useConnectionStatus();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  const {
    boards: allBoards,
    boardsLoaded,
    columns: allColumns,
    cards: allCards,
    invitations,
    createBoard,
    deleteBoard,
    addColumn,
    renameColumn,
    deleteColumn,
    shareBoard,
    inviteToBoard,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
    addCard,
    moveCard,
  } = useBoards();

  useEffect(() => {
    if (allBoards.length > 0 && !allBoards.find((b) => b.id === selectedBoardId)) {
      setSelectedBoardId(allBoards[0]!.id);
    }
  }, [allBoards, selectedBoardId]);

  const selectedBoard = allBoards.find((b) => b.id === selectedBoardId) ?? null;
  const boardColumns = allColumns.filter((c) => c.boardId === selectedBoardId);
  const boardCards = allCards.filter((c) => c.boardId === selectedBoardId);

  const cardCounts = useMemo(
    () =>
      Object.fromEntries(
        allBoards.map((b) => [b.id, allCards.filter((c) => c.boardId === b.id).length]),
      ),
    [allBoards, allCards],
  );

  const handleDeleteBoard = (id: string) => {
    deleteBoard(id).catch((err) => reportError(err, "Couldn't delete board"));
    if (selectedBoardId === id) setSelectedBoardId(null);
  };

  const handleAddCard = (
    _boardId: string,
    columnId: string,
    title: string,
    description: string,
    order: number,
  ) => {
    if (selectedBoard) {
      addCard(selectedBoard, columnId, title, description, order).catch((err) =>
        reportError(err, "Couldn't add card"),
      );
    }
  };

  // One create-and-select closure for the sidebar and the first-run CTA;
  // each call site handles rejections its own way.
  const createBoardAndSelect = (name: string) =>
    createBoard(name).then((r) => setSelectedBoardId(r.id));

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
      appName="Board"
      appIcon={<Kanban size={22} color="var(--mantine-color-indigo-6)" />}
      banner={banner}
      navbar={
        <BoardSidebar
          boards={allBoards}
          personalSpaceId={personalSpaceId}
          selectedBoardId={selectedBoardId}
          onSelect={setSelectedBoardId}
          onCreate={(name) =>
            createBoardAndSelect(name).catch((err) => reportError(err, "Couldn't create board"))
          }
          onDelete={handleDeleteBoard}
          cardCounts={cardCounts}
        />
      }
      navbarWidth={200}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={syncStatus}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      {selectedBoard ? (
        <BoardView
          board={selectedBoard}
          columns={boardColumns}
          cards={boardCards}
          personalSpaceId={personalSpaceId}
          isAdmin={selectedBoard._spaceId ? isAdmin(selectedBoard._spaceId) : false}
          onAddColumn={(name) =>
            addColumn(selectedBoard, name).catch((err) => reportError(err, "Couldn't add column"))
          }
          onRenameColumn={(id, name) =>
            renameColumn(id, name).catch((err) => reportError(err, "Couldn't rename column"))
          }
          onDeleteColumn={(id) =>
            deleteColumn(id).catch((err) => reportError(err, "Couldn't delete column"))
          }
          onAddCard={handleAddCard}
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
            title={boardsLoaded && allBoards.length === 0 ? "No boards yet" : "No board selected"}
            description={
              boardsLoaded && allBoards.length === 0
                ? "Create your first board to get started."
                : "Create a board to get started"
            }
            action={
              boardsLoaded && allBoards.length === 0 ? (
                <CreateFirstItem
                  noun="board"
                  helperText="Starts with To Do, In Progress, and Done columns."
                  onCreate={createBoardAndSelect}
                />
              ) : undefined
            }
          />
        </div>
      )}
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// App — wraps BoardApp in BetterbaseProvider when authenticated
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <ScopedAppTree
      appName={DB_NAME}
      collections={[boards, columns, cards]}
      openDatabaseForScope={openDatabaseForScope}
      deleteAnonymousDatabase={deleteAnonymousDatabase}
      getDb={() => db}
      local={<LocalBoardApp />}
    >
      {(session) => <BoardApp personalSpaceId={session.getPersonalSpaceId()} />}
    </ScopedAppTree>
  );
}
