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
}

/**
 * Fires retirement once the engine reports ready (the bootstrap flushAll
 * pushed the adopted records — deleting the source is then lossless).
 * No-ops when nothing is pending; failures log and retry on the next
 * login's ready transition.
 */
function RetireAnonymousEffect({ config }: { config: RetireAnonymousConfig }) {
  const { phase } = useSync();
  useEffect(() => {
    if (phase !== "ready") return;
    retireLocalData(config).catch((err) => {
      console.error("Failed to retire adopted anonymous database:", err);
    });
  }, [phase, config]);
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
      {retireAnonymous && <RetireAnonymousEffect config={retireAnonymous} />}
      {children}
    </>
  );
}
