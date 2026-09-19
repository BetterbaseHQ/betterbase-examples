import { Box, Loader } from "@mantine/core";
import { useSyncReady } from "betterbase/sync/react";
import type { ReactNode } from "react";

/**
 * Full-height loading gate until the sync context is populated
 * (`useSyncReady()` — keys derived, engine mounted). Data is not necessarily
 * loaded yet: gate one-time seeding on `useSync().phase === "ready"` instead.
 *
 * The provider-wrapping pattern every synced example app repeats.
 */
export function SyncedAppGate({ children }: { children: ReactNode }) {
  const ready = useSyncReady();
  if (!ready) {
    return (
      <Box style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
        <Loader />
      </Box>
    );
  }
  return <>{children}</>;
}
