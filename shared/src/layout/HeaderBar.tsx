import { Group, Burger, Text, UnstyledButton } from "@mantine/core";
import { EncryptionIndicator } from "./EncryptionIndicator.js";
import { UserArea } from "./UserArea.js";
import { UploadQueueStatus } from "./UploadQueueStatus.js";
import { runtimeConfig } from "../lib/runtime-config.js";
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
  /** "sync" (default) shows sync copy; "auth" shows sign-in-only copy. */
  authMode?: "sync" | "auth";
  /** Mobile burger toggle — omit to hide burger */
  navbarOpened?: boolean;
  onNavbarToggle?: () => void;
  /** URL to navigate when clicking the app icon */
  launchpadUrl?: string;
  /** File-bytes upload queue status; omit in apps without a FileStore. */
  uploadQueue?: {
    pending: number;
    errored: number;
    onRetry: () => void;
  };
}

/** Launchpad link target in the dev environment (each app on its own port). */
export const DEFAULT_LAUNCHPAD_URL = "http://localhost:5380";

/**
 * Launchpad link target: the same origin's root when served from the unified
 * examples container (runtime config present), the dev origin otherwise.
 */
export function resolveLaunchpadUrl(): string {
  return runtimeConfig() ? `${window.location.origin}/` : DEFAULT_LAUNCHPAD_URL;
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
  authMode,
  navbarOpened,
  onNavbarToggle,
  launchpadUrl = resolveLaunchpadUrl(),
  uploadQueue,
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
          aria-label="Back to launchpad"
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
        {uploadQueue && (
          <UploadQueueStatus
            pending={uploadQueue.pending}
            errored={uploadQueue.errored}
            onRetry={uploadQueue.onRetry}
          />
        )}
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
          mode={authMode}
        />
      </Group>
    </Group>
  );
}
