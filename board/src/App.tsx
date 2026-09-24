import { useState, useEffect, useMemo, useRef } from "react";
import { Kanban } from "lucide-react";
import { BetterbaseProvider, useConnectionStatus, useSync } from "betterbase/sync/react";
import { deleteTree } from "betterbase/sync";
import { useQuery, DatabaseProvider } from "betterbase/db/react";
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
  defaultRecordId,
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
import { BoardSidebar } from "@/components/BoardSidebar";
import { BoardView } from "@/components/BoardView";

export async function createBoardWithColumns(name: string, id?: string) {
  const board = await db.put(boards, { name }, id ? { id } : undefined);
  const defaults = ["To Do", "In Progress", "Done"];
  for (let i = 0; i < defaults.length; i++) {
    // Deterministic column ids for deterministic boards — concurrent
    // default seeds collapse instead of duplicating columns.
    const columnId = id ? `${id}-col-${i + 1}` : undefined;
    await db.put(
      columns,
      { boardId: board.id, name: defaults[i]!, sortOrder: i + 1 },
      columnId ? { id: columnId } : undefined,
    );
  }
  return board;
}

// ---------------------------------------------------------------------------
// LocalBoardApp — offline-first, no sharing (unauthenticated path)
// ---------------------------------------------------------------------------

function LocalBoardApp() {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const autoCreated = useRef(false);

  const boardResult = useQuery(boards, {
    sort: [
      { field: "createdAt", direction: "asc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allBoards = boardResult?.records ?? [];

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

  // Auto-create a default board on first run (parity with the synced path)
  useEffect(() => {
    if (boardResult && boardResult.records.length === 0 && !autoCreated.current) {
      autoCreated.current = true;
      // A tombstone under the default id means the user deleted the
      // default board — don't recreate it. AUD-053: release the guard on
      // failure so retry isn't blocked.
      db.get(boards, defaultRecordId(boards), { includeDeleted: true })
        .then((deleted) =>
          deleted === null
            ? createBoardWithColumns("My Board", defaultRecordId(boards))
            : undefined,
        )
        .catch((err) => {
          reportError(err, "Couldn't create board");
          autoCreated.current = false;
        });
    }
  }, [boardResult]);

  const createBoard = (name: string) => {
    createBoardWithColumns(name)
      .then((record) => setSelectedBoardId(record.id))
      .catch((err) => reportError(err, "Couldn't create board"));
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
            title="No board selected"
            description="Select a board or create a new one"
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
  const { phase, error: syncError } = useSync();
  const syncStatus = useConnectionStatus();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  const {
    boards: allBoards,
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

  // Auto-create a default board only after the full bootstrap sync completes,
  // and only when the collection verifiably reads empty from the sync db —
  // a reactive-query length check at ready-time races the post-pull query
  // propagation and duplicated the board on every reload.
  useDefaultRecord(
    phase === "ready",
    boards,
    (id) => createBoard("My Board", id),
    "Couldn't create default board",
  );

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
            createBoard(name)
              .then((r) => setSelectedBoardId(r.id))
              .catch((err) => reportError(err, "Couldn't create board"))
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
            title="No board selected"
            description="Select a board or create a new one"
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
  const { isAuthenticated, session, clientId, logout } = useAuth();
  const {
    ready: dbReady,
    key: dbScopeKey,
    error: dbError,
  } = useDbScope(openDatabaseForScope, session ? accountScopeKey(session) : null);
  return (
    <DatabaseProvider value={db}>
      <DbScopeGate key={dbScopeKey} ready={dbReady} error={dbError}>
        {isAuthenticated && session ? (
          <BetterbaseProvider
            adapter={db}
            collections={[boards, columns, cards]}
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
              <BoardApp personalSpaceId={session.getPersonalSpaceId()} />
            </SyncedAppGate>
          </BetterbaseProvider>
        ) : (
          <LocalBoardApp />
        )}
      </DbScopeGate>
    </DatabaseProvider>
  );
}
