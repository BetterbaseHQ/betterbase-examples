import { Badge } from "@mantine/core";
import { WifiOff, AlertTriangle, RefreshCw, Check } from "lucide-react";
import type { ConnectionStatus } from "betterbase/sync/react";

/** Kept as an alias of the SDK's ConnectionStatus for component consumers. */
export type SyncStatus = ConnectionStatus;

interface SyncStatusBadgeProps {
  status: SyncStatus;
}

/**
 * Always rendered: healthy states are as informative as broken ones — a
 * local-first app should show "Synced" the way an editor shows "Saved".
 * Also gives tests (and assistive tech) a stable, deterministic signal for
 * "the bootstrap push settled" instead of time-based guessing.
 */
export function SyncStatusBadge({ status }: SyncStatusBadgeProps) {
  if (status === "offline") {
    return (
      <Badge size="sm" variant="light" color="gray" leftSection={<WifiOff size={12} />}>
        Offline
      </Badge>
    );
  }

  if (status === "error") {
    return (
      <Badge size="sm" variant="light" color="yellow" leftSection={<AlertTriangle size={12} />}>
        Sync error
      </Badge>
    );
  }

  if (status === "syncing") {
    return (
      <Badge size="sm" variant="light" color="blue" leftSection={<RefreshCw size={12} />}>
        Syncing
      </Badge>
    );
  }

  return (
    <Badge
      size="sm"
      variant="light"
      color="green"
      leftSection={<Check size={12} />}
      data-testid="sync-status-synced"
    >
      Synced
    </Badge>
  );
}
