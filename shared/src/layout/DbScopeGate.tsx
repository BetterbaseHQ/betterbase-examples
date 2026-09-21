import { Box, Loader } from "@mantine/core";
import type { ReactNode } from "react";

/**
 * Full-page gate while the account-scoped database opens (account switch,
 * first sign-in). Sits OUTSIDE BetterbaseProvider — the adapter doesn't
 * exist until the right database is open (AUD-045).
 */
export function DbScopeGate({ ready, children }: { ready: boolean; children: ReactNode }) {
  if (!ready) {
    return (
      <Box style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
        <Loader />
      </Box>
    );
  }
  return <>{children}</>;
}
