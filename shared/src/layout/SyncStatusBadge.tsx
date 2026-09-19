import { Badge } from "@mantine/core";
import { WifiOff, AlertTriangle } from "lucide-react";
import type { ConnectionStatus } from "betterbase/sync/react";

/** Kept as an alias of the SDK's ConnectionStatus for component consumers. */
export type SyncStatus = ConnectionStatus;

interface SyncStatusBadgeProps {
  status: SyncStatus;
}

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

  return null;
}
