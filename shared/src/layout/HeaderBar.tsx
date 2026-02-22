import { Group, Burger, Text, UnstyledButton } from "@mantine/core";
import { EncryptionIndicator } from "./EncryptionIndicator.js";
import { UserArea } from "./UserArea.js";
import type { SyncStatus } from "./SyncStatusBadge.js";
import type { ReactNode } from "react";

interface HeaderBarProps {
  appName: string;
  appIcon: ReactNode;
  isAuthenticated: boolean;
  handle: string | null;
  syncStatus?: SyncStatus;
  syncError?: string;
  onLogin: () => Promise<void>;
  onLogout: () => void;
  /** Mobile burger toggle — omit to hide burger */
  navbarOpened?: boolean;
  onNavbarToggle?: () => void;
  /** URL to navigate when clicking the app icon */
  launchpadUrl?: string;
}

export function HeaderBar({
  appName,
  appIcon,
  isAuthenticated,
  handle,
  syncStatus = "synced",
  syncError,
  onLogin,
  onLogout,
  navbarOpened,
  onNavbarToggle,
  launchpadUrl = "http://localhost:5380",
}: HeaderBarProps) {
  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      {/* Left side */}
      <Group gap="sm" wrap="nowrap">
        {onNavbarToggle != null && (
          <Burger
            opened={navbarOpened ?? false}
            onClick={onNavbarToggle}
            hiddenFrom="sm"
            size="sm"
          />
        )}
        <UnstyledButton
          component="a"
          href={launchpadUrl}
          style={{ display: "flex", alignItems: "center" }}
        >
          {appIcon}
        </UnstyledButton>
        <Text fw={600} size="md">
          {appName}
        </Text>
      </Group>

      {/* Right side */}
      <Group gap="md" wrap="nowrap">
        <EncryptionIndicator
          isAuthenticated={isAuthenticated}
          hasError={syncStatus === "error"}
          errorMessage={syncError}
        />
        <UserArea
          isAuthenticated={isAuthenticated}
          handle={handle}
          syncStatus={syncStatus}
          onLogin={onLogin}
          onLogout={onLogout}
        />
      </Group>
    </Group>
  );
}
