import { Box, Loader } from "@mantine/core";
import { useEffect } from "react";
import { useSync, useSyncReady } from "betterbase/sync/react";
import { retireLocalData } from "../lib/adopt-local-data.js";
import type { ReactNode } from "react";

/** Config for retiring an adopted anonymous database after first sync. */
export interface RetireAnonymousConfig {
  appName: string;
  scopeKey: string;
  /** Deletes the anonymous database files (SDK deleteDatabase under the hood). */
  deleteAnonymousDb: () => Promise<void>;
  /** Moves un-uploaded anonymous blobs into the scoped store before deletion. */
  transferFiles?: () => Promise<void>;
  /** Anonymous file-cache namespace — deleted after the records database. */
  deleteAnonymousFilesNamespace?: string;
}

/**
 * Fires retirement once the engine reports ready (the bootstrap flushAll
 * pushed the adopted records — deleting the source is then lossless).
 * No-ops when nothing is pending. A failed attempt (e.g. the leader lock
 * is still held by the displaced database's deferred close) retries once
 * in-session after a delay, then falls back to the next login's ready
 * transition. The state machine is idempotent, so overlapping or
 * repeated attempts are harmless.
 */
function RetireAnonymousEffect({
  appName,
  scopeKey,
  deleteAnonymousDb,
  transferFiles,
  deleteAnonymousFilesNamespace,
}: RetireAnonymousConfig) {
  const { phase } = useSync();

  useEffect(() => {
    if (phase !== "ready") return;
    const attempt = (isRetry: boolean) => {
      retireLocalData({
        appName,
        scopeKey,
        deleteAnonymousDb,
        transferFiles,
        deleteAnonymousFilesNamespace,
      }).catch((err) => {
        console.error("Failed to retire adopted anonymous database:", err);
        if (!isRetry) {
          // One deliberate in-session retry — e.g. the leader lock
          // freed right after the failed attempt. Beyond that, the
          // next login's ready transition retries.
          setTimeout(() => attempt(true), 30_000);
        }
      });
    };
    attempt(false);
    // Primitives only — a config object identity would re-fire this on
    // every App render while phase === "ready".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, appName, scopeKey, deleteAnonymousDb, transferFiles, deleteAnonymousFilesNamespace]);

  return null;
}

/**
 * Debug aid: surfaces engine errors that no app UI currently renders.
 * Mounts only after the ready gate, so the provider value is non-null.
 */
function SyncErrorReporter() {
  const { error, phase } = useSync();
  useEffect(() => {
    if (error) {
      console.error("[synced-app-gate] engine error", { phase, error });
    }
  }, [error, phase]);
  return null;
}

/**
 * Full-height loading gate until the sync context is populated
 * (`useSyncReady()` — keys derived, engine mounted). Data is not
 * necessarily loaded yet: gate one-time seeding on
 * `useSync().phase === "ready"` instead.
 *
 * The provider-wrapping pattern every synced example app repeats. Pass
 * `retireAnonymous` to delete the adopted anonymous database once the
 * first sync completes (see lib/adopt-local-data.ts).
 */
export function SyncedAppGate({
  children,
  retireAnonymous,
}: {
  children: ReactNode;
  retireAnonymous?: RetireAnonymousConfig;
}) {
  const ready = useSyncReady();
  if (!ready) {
    return (
      <Box style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
        <Loader />
      </Box>
    );
  }
  return (
    <>
      {retireAnonymous && <RetireAnonymousEffect {...retireAnonymous} />}
      <SyncErrorReporter />
      {children}
    </>
  );
}
