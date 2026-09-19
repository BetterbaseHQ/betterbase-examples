/**
 * Test stub for `betterbase/sync/react`, installed via resolve alias:
 *
 * ```ts
 * // vitest.browser.config.ts
 * resolve: {
 *   alias: { "betterbase/sync/react": <path to this file> },
 * },
 * ```
 *
 * The real module performs server discovery and opens a WebSocket — not viable
 * in component tests. With the alias, every import in the module graph gets
 * this stub while the rest of the app runs for real: the local db, CRDT
 * collections, `useQuery` reactivity, and all app code. Only the sync boundary
 * (transport, spaces lifecycle, presence) is stubbed.
 *
 * (Alias interception is used instead of `vi.mock` because Vitest's browser
 * mocker cannot reliably intercept bare package specifiers.)
 *
 * Tests drive the stub through the setters below, imported from
 * `@betterbase/examples-shared/test` — same file, same module instance.
 */
import { vi } from "vitest";
import { useRef, type ReactNode } from "react";

// Re-exported from the real module — querying works without a server.
import {
  DatabaseProvider,
  useQuery as useQueryBase,
  type CollectionRead,
  type SchemaShape,
} from "betterbase/db/react";
import type { CollectionDefHandle } from "betterbase/db";
export type { EditHistoryEntry } from "betterbase/sync/react";

/**
 * The sync layer's useQuery differs from the raw db one in two ways the app
 * code relies on: it never returns undefined, and its records carry the
 * spaces-middleware `_spaceId` field. The stub mirrors both — all records
 * belong to the personal space (`makeFakeSession().getPersonalSpaceId()`).
 */
export const STUB_PERSONAL_SPACE_ID = "personal-space-1";

export function useQuery<S extends SchemaShape>(
  def: CollectionDefHandle<string, S>,
  query?: Parameters<typeof useQueryBase>[1],
): { records: Array<CollectionRead<S> & { _spaceId: string }> } {
  const raw = useQueryBase(def, query);
  const cache = useRef<{ raw: unknown; mapped: { records: unknown[] } }>({
    raw: undefined,
    mapped: { records: [] },
  });
  if (raw !== cache.current.raw) {
    cache.current = {
      raw,
      mapped: {
        records: (raw?.records ?? []).map((r) =>
          "_spaceId" in (r as object) ? r : { ...r, _spaceId: STUB_PERSONAL_SPACE_ID },
        ),
      },
    };
  }
  return cache.current.mapped as { records: Array<CollectionRead<S> & { _spaceId: string }> };
}

// ---------------------------------------------------------------------------
// Provider capture
// ---------------------------------------------------------------------------

export interface CapturedProviderProps {
  collections: readonly unknown[];
  session: unknown;
  adapter: unknown;
  clientId: string | undefined;
  props: Record<string, unknown>;
}

let captured: CapturedProviderProps | null = null;

/** Props the last-mounted BetterbaseProvider (stub) received. */
export function lastProviderProps(): CapturedProviderProps {
  if (!captured) throw new Error("stub BetterbaseProvider has not mounted yet");
  return captured;
}

export function BetterbaseProvider(props: Record<string, unknown>) {
  const { children, ...rest } = props as { children?: ReactNode } & Record<string, unknown>;
  captured = {
    collections: (rest.collections as readonly unknown[]) ?? [],
    session: rest.session,
    adapter: rest.adapter,
    clientId: rest.clientId as string | undefined,
    props: rest,
  };
  // The real provider supplies the db context (useQuery/useDatabase) — mirror
  // that so app trees render unchanged
  return (
    <DatabaseProvider value={rest.adapter as never}>{children}</DatabaseProvider>
  );
}

export function FileStoreProvider({
  children,
  fileStore: _fileStore,
}: {
  children?: ReactNode;
  fileStore?: unknown;
}) {
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// useSync state control
// ---------------------------------------------------------------------------

export interface MockSyncState {
  phase: "connecting" | "bootstrapping" | "ready";
  syncing: boolean;
  error: string | null;
}

let syncState: MockSyncState = { phase: "ready", syncing: false, error: null };

/** Change what the app's `useSync()` reads (e.g. phase: "connecting"). */
export function setSyncState(state: Partial<MockSyncState>) {
  syncState = { ...syncState, ...state };
}

export function getSyncState(): MockSyncState {
  return syncState;
}

// ---------------------------------------------------------------------------
// useSyncDb control — tests point it at the app's real local db
// ---------------------------------------------------------------------------

let dbAdapter: unknown = null;

/** Provide the adapter returned by `useSyncDb()` — usually the app's `db`. */
export function setSyncDb(adapter: unknown) {
  dbAdapter = adapter;
}

// ---------------------------------------------------------------------------
// Spaces / invitations
// ---------------------------------------------------------------------------

/**
 * Auto-stubbing space ops: any accessed method resolves to undefined and is
 * recorded, so tests can both drive (`spaceOp("createSpace").mockResolvedValue(...)`)
 * and assert (`expect(spaceOp("invite")).toHaveBeenCalledWith(...)`).
 */
const spaceOps: Record<string, ReturnType<typeof vi.fn>> = {};

export function spaceOp(name: string): ReturnType<typeof vi.fn> {
  if (!spaceOps[name]) spaceOps[name] = vi.fn().mockResolvedValue(undefined);
  return spaceOps[name];
}

export function useSpaces(): Record<string, ReturnType<typeof vi.fn>> {
  return new Proxy(spaceOps, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue(undefined);
      return target[prop];
    },
  });
}

let pendingInvitations: unknown[] = [];

export function setPendingInvitations(invitations: unknown[]) {
  pendingInvitations = invitations;
}

export function usePendingInvitations() {
  // Mirrors the real hook's query-result shape (apps read `.records`)
  return { records: pendingInvitations };
}

// ---------------------------------------------------------------------------
// Presence / events / files — minimal inert shapes
// ---------------------------------------------------------------------------

export function useSync() {
  return {
    ...syncState,
    sync: vi.fn().mockResolvedValue(undefined),
    scheduleSync: vi.fn(),
    flushAll: vi.fn().mockResolvedValue(undefined),
    resubscribe: vi.fn(),
    privateKeyJwk: null,
    presenceManager: null,
    eventManager: null,
  };
}

export function useSyncReady() {
  return true;
}

export function useSyncDb() {
  if (!dbAdapter) throw new Error("call setSyncDb(db) before rendering the app");
  return dbAdapter;
}

export function usePresence(_spaceId: string | null | undefined, _state?: unknown): unknown[] {
  return [];
}

export function usePeers<T = unknown>(_spaceId: string | null | undefined): T[] {
  return [];
}

export function useMembers(_spaceId: string | null | undefined) {
  return { members: [] as Array<{ id: string; handle: string }> };
}

export function useFile(_fileId: string | null | undefined, _mimeType?: string) {
  return { url: null as string | null, status: "idle" as string };
}

export function useEditChain(_record: unknown): unknown[] {
  return [];
}

export function useSendEvent(_spaceId: string | null | undefined) {
  return vi.fn();
}

export function useEvent(
  _spaceId: string | null | undefined,
  _type: string,
  _handler: (data: unknown) => void,
): void {}
