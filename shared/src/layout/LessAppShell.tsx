import { type ReactNode } from "react";
import { AppShell, Box, type MantineSpacing } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { HeaderBar } from "./HeaderBar.js";
import type { SyncStatus } from "./SyncStatusBadge.js";

interface LessAppShellProps {
  /** Display name shown in the header, e.g. "Less Tasks" */
  appName: string;
  /** Icon element shown in the header (links to launchpad) */
  appIcon: ReactNode;
  /** Sidebar content — omit for apps without a sidebar */
  navbar?: ReactNode;
  /** Sidebar width in px (default 280) */
  navbarWidth?: number;
  /** Main content padding (default "md"). Use 0 for edge-to-edge layouts. */
  padding?: MantineSpacing;
  /** Optional banner shown above main content (e.g. invitation notifications). Edge-to-edge. */
  banner?: ReactNode;
  /** Main content area */
  children: ReactNode;
  /** Auth state */
  isAuthenticated: boolean;
  handle: string | null;
  syncStatus?: SyncStatus;
  syncError?: string;
  onLogin: () => Promise<void>;
  onLogout: () => void;
  /** URL for launchpad icon link (default http://localhost:5380) */
  launchpadUrl?: string;
}

export function LessAppShell({
  appName,
  appIcon,
  navbar,
  navbarWidth = 280,
  padding = "md",
  banner,
  children,
  isAuthenticated,
  handle,
  syncStatus,
  syncError,
  onLogin,
  onLogout,
  launchpadUrl,
}: LessAppShellProps) {
  const [opened, { toggle }] = useDisclosure();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={
        navbar
          ? {
              width: navbarWidth,
              breakpoint: "sm",
              collapsed: { mobile: !opened },
            }
          : undefined
      }
      padding={0}
    >
      <AppShell.Header>
        <HeaderBar
          appName={appName}
          appIcon={appIcon}
          isAuthenticated={isAuthenticated}
          handle={handle}
          syncStatus={syncStatus}
          syncError={syncError}
          onLogin={onLogin}
          onLogout={onLogout}
          navbarOpened={navbar ? opened : undefined}
          onNavbarToggle={navbar ? toggle : undefined}
          launchpadUrl={launchpadUrl}
        />
      </AppShell.Header>

      {navbar && <AppShell.Navbar p="md">{navbar}</AppShell.Navbar>}

      <AppShell.Main>
        {banner}
        <Box p={padding}>{children}</Box>
      </AppShell.Main>
    </AppShell>
  );
}
