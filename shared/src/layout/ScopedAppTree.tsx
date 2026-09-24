import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { DatabaseProvider } from "betterbase/db/react";
import { BetterbaseProvider, FileStoreProvider } from "betterbase/sync/react";
import { FileStore } from "betterbase/sync";
import type { CollectionDefHandle, Database } from "betterbase/db";
import { useAuth, accountScopeKey, useDbScope, runtimeDomain } from "../index.js";
import { DbScopeGate } from "./DbScopeGate.js";
import { SyncedAppGate } from "./SyncedAppGate.js";
import type { RetireAnonymousConfig } from "./SyncedAppGate.js";

/** What `useAuth` reports for a signed-in session (opaque shared type). */
type AuthSession = NonNullable<ReturnType<typeof useAuth>["session"]>;

export interface ScopedAppTreeProps {
  /** Bare app/database name — the anonymous namespace and marker namespace. */
  appName: string;
  /** Collections this app syncs (also passed to BetterbaseProvider). */
  collections: ReadonlyArray<CollectionDefHandle>;
  /**
   * Opens the database for a scope (null = anonymous). Adoption of the
   * anonymous workspace happens inside this function, before the swap
   * commits — pass the app's `openDatabaseForScope` including its
   * `adoptLocalData` call (with the app's declared-defaults filter).
   */
  openDatabaseForScope: (scopeKey: string | null) => Promise<void>;
  /** Deletes the anonymous database files (SDK deleteDatabase). */
  deleteAnonymousDatabase: () => Promise<void>;
  /** Reads the app's live `db` module binding — called at render time. */
  getDb: () => Database;
  /**
   * Signed-out tree (the app's local/unauthenticated UI): a node, or a
   * function of the FileStore when `createFileStore` is configured
   * (photos' local path writes through the shared default cache).
   * Omit for no signed-out UI (chat's sign-in gate).
   */
  local?: ReactNode | ((fileStore: FileStore) => ReactNode);
  /**
   * Signed-in tree, rendered inside BetterbaseProvider + SyncedAppGate
   * (which also fires anonymous-database retirement after first sync).
   * Receives the session and, when `createFileStore` is set, the scoped
   * FileStore.
   */
  children: (session: AuthSession, fileStore: FileStore | null) => ReactNode;
  /** Collections using edit chains (chat's messages). */
  editChainCollections?: string[];
  /**
   * Photos' file-bytes isolation (AUD-045): when present, a FileStore is
   * created inside the scope-keyed subtree — the app's scope-suffix
   * getter (`currentScopeDbName`) is read post-open so account caches
   * get their own database — disposed on scope switch, passed to
   * BetterbaseProvider and to `children`; the signed-out tree is
   * wrapped in a FileStoreProvider with the shared default store.
   */
  createFileStore?: (scopeDbName: string | null) => FileStore;
  /** Synchronous scope-suffix getter (photos' `currentScopeDbName`). */
  getCurrentScopeDbName?: () => string | null;
}

/**
 * The provider wiring every example app repeats — one component instead
 * of a six-fold sandwich:
 *
 * DatabaseProvider (live `db` binding) → DbScopeGate (scope-keyed, so
 * the tree remounts on account switch/first sign-in) → BetterbaseProvider
 * (sync adapter, session, optional file store) → SyncedAppGate (context
 * ready gate + anonymous-db retirement after the bootstrap sync) → app
 * UI; signed-out renders `local` instead.
 *
 * The DatabaseProvider pin lives INSIDE the scope-keyed subtree (not in
 * main.tsx): pinning at bootstrap captures the post-callback anonymous
 * database, which the login swap later closes and retires — logged-out
 * consumers then query a terminated worker (issue #4).
 */
export function ScopedAppTree({
  appName,
  collections,
  openDatabaseForScope,
  deleteAnonymousDatabase,
  getDb,
  local,
  children,
  editChainCollections,
  createFileStore,
  getCurrentScopeDbName,
}: ScopedAppTreeProps) {
  const { isAuthenticated, session, clientId, logout } = useAuth();
  const scopeKey = session ? accountScopeKey(session) : null;
  const {
    ready: dbReady,
    key: dbScopeKey,
    error: dbError,
  } = useDbScope(openDatabaseForScope, scopeKey);

  return (
    <DatabaseProvider value={getDb()}>
      <DbScopeGate key={dbScopeKey} ready={dbReady} error={dbError}>
        {isAuthenticated && session ? (
          <ScopedAppInner
            collections={collections}
            editChainCollections={editChainCollections}
            createFileStore={createFileStore}
            getCurrentScopeDbName={getCurrentScopeDbName}
            getDb={getDb}
            session={session}
            clientId={clientId}
            logout={logout}
            retireAnonymous={{
              appName,
              scopeKey: accountScopeKey(session),
              deleteAnonymousDb: deleteAnonymousDatabase,
            }}
          >
            {children}
          </ScopedAppInner>
        ) : createFileStore ? (
          <LocalFileStores createFileStore={createFileStore} local={local} />
        ) : // Function-form `local` needs a FileStore; without
        // `createFileStore` there is none to pass.
        typeof local === "function" ? null : (
          (local ?? null)
        )}
      </DbScopeGate>
    </DatabaseProvider>
  );
}

/**
 * The inner sandwich, mounted inside the scope-keyed gate: the FileStore
 * (when configured) is created HERE, after `openDatabaseForScope`
 * resolved (its scope-suffix getter is synchronous then), and disposed
 * when the scope swaps (the gate's key remounts this subtree).
 */
function ScopedAppInner({
  collections,
  editChainCollections,
  createFileStore,
  getCurrentScopeDbName,
  getDb,
  session,
  clientId,
  logout,
  retireAnonymous,
  children,
}: {
  collections: ReadonlyArray<CollectionDefHandle>;
  editChainCollections?: string[];
  createFileStore?: (scopeDbName: string | null) => FileStore;
  getCurrentScopeDbName?: () => string | null;
  getDb: () => Database;
  session: AuthSession;
  clientId: string;
  logout: () => void;
  retireAnonymous: RetireAnonymousConfig;
  children: (session: AuthSession, fileStore: FileStore | null) => ReactNode;
}) {
  const [fileStore] = useState(() =>
    createFileStore ? createFileStore(getCurrentScopeDbName?.() ?? null) : null,
  );
  useEffect(() => {
    return () => fileStore?.dispose();
  }, [fileStore]);

  return (
    <BetterbaseProvider
      adapter={getDb()}
      collections={[...collections]}
      editChainCollections={editChainCollections}
      session={session}
      clientId={clientId}
      domain={runtimeDomain()}
      onAuthError={logout}
      fileStore={fileStore ?? undefined}
    >
      <SyncedAppGate retireAnonymous={retireAnonymous}>
        {children(session, fileStore)}
      </SyncedAppGate>
    </BetterbaseProvider>
  );
}

/**
 * Signed-out FileStore wrapper (photos' shared default cache): creates
 * the default store, provides it, and passes it to a function-form
 * `local`.
 */
function LocalFileStores({
  createFileStore,
  local,
}: {
  createFileStore: (scopeDbName: string | null) => FileStore;
  local?: ReactNode | ((fileStore: FileStore) => ReactNode);
}) {
  const [fileStore] = useState(() => createFileStore(null));
  useEffect(() => {
    return () => fileStore.dispose();
  }, [fileStore]);
  return (
    <FileStoreProvider fileStore={fileStore}>
      {typeof local === "function" ? local(fileStore) : (local ?? null)}
    </FileStoreProvider>
  );
}
