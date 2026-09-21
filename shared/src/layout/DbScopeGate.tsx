import { Box, Button, Loader, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

/**
 * Full-page gate while the account-scoped database opens (account switch,
 * first sign-in). Sits OUTSIDE BetterbaseProvider — the adapter doesn't
 * exist until the right database is open (AUD-045). An open failure shows
 * an explicit error with a reload escape hatch instead of spinning forever.
 */
export function DbScopeGate({
  ready,
  error,
  children,
}: {
  ready: boolean;
  error?: unknown;
  children: ReactNode;
}) {
  if (error) {
    return (
      <Box style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
        <Stack align="center" gap="sm" maw={420}>
          <Text fw={600}>Couldn't open local data</Text>
          <Text size="sm" c="dimmed">
            {error instanceof Error ? error.message : String(error)}
          </Text>
          <Button size="xs" variant="light" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </Stack>
      </Box>
    );
  }
  if (!ready) {
    return (
      <Box style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
        <Loader />
      </Box>
    );
  }
  return <>{children}</>;
}
