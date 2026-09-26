import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DatabaseProvider } from "betterbase/db/react";
import { BetterbaseProvider, FileStoreProvider } from "betterbase/sync/react";
import { FileStore, lazyWorkerFileStorage } from "betterbase/sync";
import type { CollectionDefHandle, Database } from "betterbase/db";
import { useAuth, accountScopeKey, useDbScope, runtimeDomain } from "../index.js";
import { DbScopeGate } from "./DbScopeGate.js";
import { SyncedAppGate } from "./SyncedAppGate.js";

/** What `useAuth` reports for a signed-in session (opaque shared type). */
type AuthSession = NonNullable<ReturnType<typeof useAuth>["session"]>;

/**
 * OPFS namespace for an app's file cache: one per account scope, plus a
 * stable anonymous namespace adopted-from on first login and deleted at
 * retirement (same lifecycle as the records databases).
 */
export function filesNamespaceFor(appName: string, scopeDbName: string | null): string {
  return scopeDbName ? `files-${scopeDbName}` : `files-${appName}-anon`;
}

/**
 * Scoped FileStore factory: every scope (and the anonymous workspace)
 * gets an OPFS file-cache worker namespace — durable storage, leader-
 * coordinated across tabs. The worker is app-provided so bundlers can
 * see the URL (same pattern as the database worker).
 */
export function createScopedFileStore(
  appName: string,
  createFilesWorker: () => Worker,
): (scopeDbName: string | null) => FileStore {
  return (scopeDbName) => {
    const namespace = scopeDbName
      ? filesNamespaceFor(appName, scopeDbName)
      : filesNamespaceFor(appName, null);
    return new FileStore({
      storage: lazyWorkerFileStorage(namespace, {
        worker: createFilesWorker(),
      }),
    });
  };
}

export interface ScopedAppTreeProps {
  /** Bare app/database name — the anonymous namespace and marker namespace. */
  appName: string;
  /** Collections this app syncs (also passed to BetterbaseProvider). */
  collections: ReadonlyArray<CollectionDefHandle>;
  /**
   * Opens the database for a scope (null = anonymous). Adoption of the
   * anonymous workspace happens inside this function, before the swap
   * commits — pass the app's `openDatabaseForScope` including its
   * `adoptLocalData` call (unconditionally (all anonymous records adopt)).
   */
  openDatabaseForScope: (scopeKey: string | null) => Promise<void>;
  /** Deletes the anonymous database files (SDK deleteDatabase). */
  deleteAnonymousDatabase: () => Promise<void>;
  /** Reads the app's live `db` module binding — called at render time. */
  getDb: () => Database;
  /**
   * Spawns the app's file-storage worker (`initFilesWorker()` entry —
   * create inline so bundlers can see the URL).
   */
  createFilesWorker: () => Worker;
  /** Synchronous scope-suffix getter (each app's `currentScopeDbName`). */
  getCurrentScopeDbName: () => string | null;
  /**
   * Signed-out tree (the app's local/unauthenticated UI). Omit for no
   * signed-out UI (chat's sign-in gate). A function receives the
   * anonymous FileStore.
   */
  local?: ReactNode | ((fileStore: FileStore) => ReactNode);
  /**
   * Signed-in tree, rendered inside BetterbaseProvider + SyncedAppGate
   * (which also fires anonymous retirement after first sync). Receives
   * the session and the scoped FileStore.
   */
  children: (session: AuthSession, fileStore: FileStore) => ReactNode;
  /** Collections using edit chains (chat's messages). */
  editChainCollections?: string[];
}

/**
 * The provider wiring every example app repeats — one component instead
 * of a six-fold sandwich:
 *
 * DatabaseProvider (live `db` binding) → DbScopeGate (scope-keyed, so
 * the tree remounts on account switch/first sign-in) → BetterbaseProvider
 * (sync adapter, session, scoped file store) → SyncedAppGate (context
 * ready gate + anonymous retirement after the bootstrap sync) → app UI;
 * signed-out renders `local` instead.
 *
 * The provider's value is re-read from the live `db` binding on every
 * render via `getDb()` (not pinned once, as main.tsx once did — issue
 * #4: a bootstrap pin captures the post-callback anonymous database,
 * which the login swap later closes and retires, leaving logged-out
 * consumers querying a terminated worker). It sits above the gate so
 * signed-out trees can consume Database context too.
 */
export function ScopedAppTree({
  appName,
  collections,
  openDatabaseForScope,
  deleteAnonymousDatabase,
  getDb,
  createFilesWorker,
  getCurrentScopeDbName,
  local,
  children,
  editChainCollections,
}: ScopedAppTreeProps) {
  const { isAuthenticated, session, clientId, logout } = useAuth();
  const scopeKey = session ? accountScopeKey(session) : null;
  const {
    ready: dbReady,
    key: dbScopeKey,
    error: dbError,
  } = useDbScope(openDatabaseForScope, scopeKey);

  const createFileStore = useMemo(
    () => createScopedFileStore(appName, createFilesWorker),
    [appName, createFilesWorker],
  );

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
            appName={appName}
            deleteAnonymousDatabase={deleteAnonymousDatabase}
          >
            {children}
          </ScopedAppInner>
        ) : (
          <LocalFileStores createFileStore={createFileStore} local={local} />
        )}
      </DbScopeGate>
    </DatabaseProvider>
  );
}

/**
 * The inner sandwich, mounted inside the scope-keyed gate: the FileStore
 * is created HERE, after `openDatabaseForScope` resolved (its
 * scope-suffix getter is synchronous then), and disposed when the scope
 * swaps (the gate's key remounts this subtree).
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
  appName,
  deleteAnonymousDatabase,
  children,
}: {
  collections: ReadonlyArray<CollectionDefHandle>;
  editChainCollections?: string[];
  createFileStore: (scopeDbName: string | null) => FileStore;
  getCurrentScopeDbName: () => string | null;
  getDb: () => Database;
  session: AuthSession;
  clientId: string;
  logout: () => void;
  appName: string;
  deleteAnonymousDatabase: () => Promise<void>;
  children: (session: AuthSession, fileStore: FileStore) => ReactNode;
}) {
  const [fileStore] = useState(() => createFileStore(getCurrentScopeDbName?.() ?? null));
  const disposeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // StrictMode's double-mount runs cleanup immediately after setup — a
    // synchronous dispose would kill the live store (revoked object URLs,
    // dropped subscribers). Dispose is deferred to a macrotask and
    // cancelled on remount; real unmounts still dispose on the next tick.
    if (disposeTimer.current !== null) {
      clearTimeout(disposeTimer.current);
      disposeTimer.current = null;
    }
    return () => {
      disposeTimer.current = setTimeout(() => fileStore?.dispose(), 0);
    };
  }, [fileStore]);

  // Adoption moved the records; the blobs they reference still sit in the
  // anonymous namespace. Transfer them into the scoped store's upload
  // queue before retirement deletes that namespace — a connected store
  // then pushes them to the server like any queued file.
  const transferFiles = useMemo(() => {
    return () => {
      const anon = createFileStore(null);
      // Dispose the source ALWAYS: a failed transfer aborts retirement
      // (source bytes survive for the retry), but the worker and its
      // leader lock on the anonymous namespace must not leak — the next
      // attempt spawns another.
      return fileStore
        .transferUnuploadedFrom(anon)
        .finally(() => {
          anon.dispose();
        })
        .then(() => undefined);
    };
  }, [createFileStore, fileStore]);
  return (
    <BetterbaseProvider
      adapter={getDb()}
      collections={[...collections]}
      editChainCollections={editChainCollections}
      session={session}
      clientId={clientId}
      domain={runtimeDomain()}
      onAuthError={logout}
      fileStore={fileStore}
    >
      <SyncedAppGate
        retireAnonymous={{
          appName,
          scopeKey: accountScopeKey(session),
          deleteAnonymousDb: async () => {
            await deleteAnonymousDatabase();
          },
          transferFiles,
          deleteAnonymousFilesNamespace: filesNamespaceFor(appName, null),
        }}
      >
        {children(session, fileStore)}
      </SyncedAppGate>
    </BetterbaseProvider>
  );
}

/**
 * Signed-out FileStore wrapper: creates the anonymous-namespace store,
 * provides it, and passes it to a function-form `local`.
 */
function LocalFileStores({
  createFileStore,
  local,
}: {
  createFileStore: (scopeDbName: string | null) => FileStore;
  local?: ReactNode | ((fileStore: FileStore) => ReactNode);
}) {
  const [fileStore] = useState(() => createFileStore(null));
  const disposeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Deferred for StrictMode — see ScopedAppInner.
    if (disposeTimer.current !== null) {
      clearTimeout(disposeTimer.current);
      disposeTimer.current = null;
    }
    return () => {
      disposeTimer.current = setTimeout(() => fileStore.dispose(), 0);
    };
  }, [fileStore]);
  return (
    <FileStoreProvider fileStore={fileStore}>
      {typeof local === "function" ? local(fileStore) : (local ?? null)}
    </FileStoreProvider>
  );
}
