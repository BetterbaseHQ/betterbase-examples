import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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

interface ScopedAppTreeBaseProps {
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
   * Signed-out tree (the app's local/unauthenticated UI). Omit for no
   * signed-out UI (chat's sign-in gate). The WithStores variant widens
   * this to also accept a function of the scoped FileStore.
   */
  local?: ReactNode;
  /**
   * Signed-in tree, rendered inside BetterbaseProvider + SyncedAppGate
   * (which also fires anonymous-database retirement after first sync).
   * Receives the session and, when `createFileStore` is set, the scoped
   * FileStore.
   */
  children: (session: AuthSession, fileStore: FileStore | null) => ReactNode;
  /** Collections using edit chains (chat's messages). */
  editChainCollections?: string[];
  /** Synchronous scope-suffix getter (photos' `currentScopeDbName`). */
  getCurrentScopeDbName?: () => string | null;
}

/**
 * FileStore-configured variant (photos): the store is created inside
 * the scope-keyed subtree — the scope-suffix getter is read post-open
 * so account caches get their own database — disposed on scope switch,
 * passed to BetterbaseProvider and `children`; the signed-out tree is
 * wrapped in a FileStoreProvider and may take the (non-null) store.
 */
export interface ScopedAppTreeWithStoresProps extends Omit<ScopedAppTreeBaseProps, "local"> {
  createFileStore: (scopeDbName: string | null) => FileStore;
  /** Signed-out tree: a node, or a function of the scoped FileStore. */
  local?: ReactNode | ((fileStore: FileStore) => ReactNode);
}

/** Without a FileStore there is nothing to pass a function-form `local`. */
export interface ScopedAppTreePlainProps extends ScopedAppTreeBaseProps {
  createFileStore?: undefined;
}

export type ScopedAppTreeProps = ScopedAppTreeWithStoresProps | ScopedAppTreePlainProps;

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
  // anonymous cache (a different FileStore database). Transfer them into
  // the scoped store's upload queue before retirement deletes that cache —
  // a connected store then pushes them to the server like any queued file.
  const transferFiles = useMemo(() => {
    if (!createFileStore || !fileStore) return undefined;
    return () => fileStore.transferUnuploadedFrom(new FileStore()).then(() => undefined);
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
      fileStore={fileStore ?? undefined}
    >
      <SyncedAppGate retireAnonymous={{ ...retireAnonymous, transferFiles }}>
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
