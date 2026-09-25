import { Badge, Tooltip } from "@mantine/core";
import { WifiOff, AlertTriangle, RefreshCw, Check } from "lucide-react";
import type { ReactNode } from "react";
import type { ConnectionStatus } from "betterbase/sync/react";

/** Kept as an alias of the SDK's ConnectionStatus for component consumers. */
export type SyncStatus = ConnectionStatus;

interface SyncStatusBadgeProps {
  status: SyncStatus;
  /** Human-readable detail shown alongside the tooltip when status is "error". */
  errorDetail?: string;
}

const ENCRYPTION_NOTE =
  "Everything in this app is end-to-end encrypted on your device before it syncs — the server only ever stores encrypted blobs.";

const ERROR_FALLBACK = "Couldn't reach the sync server.";

export const STATUS_APPEARANCE: Record<
  SyncStatus,
  { label: string; color: string; icon: ReactNode }
> = {
  offline: { label: "Offline", color: "gray", icon: <WifiOff size={12} /> },
  error: { label: "Sync error", color: "yellow", icon: <AlertTriangle size={12} /> },
  syncing: { label: "Syncing", color: "blue", icon: <RefreshCw size={12} /> },
  synced: { label: "Synced", color: "green", icon: <Check size={12} /> },
};

/**
 * The single header status signal: how syncing is doing, with the encryption
 * guarantee one hover/focus away. Healthy states are as informative as broken
 * ones — a local-first app should show "Synced" the way an editor shows
 * "Saved". Also gives tests (and assistive tech) a stable, deterministic
 * signal for "the bootstrap push settled" instead of time-based guessing.
 */
export function SyncStatusBadge({ status, errorDetail }: SyncStatusBadgeProps) {
  const { label, color, icon } = STATUS_APPEARANCE[status];
  const tooltip =
    status === "error" ? `${errorDetail ?? ERROR_FALLBACK} ${ENCRYPTION_NOTE}` : ENCRYPTION_NOTE;

  return (
    <Tooltip label={tooltip} position="bottom" maw={280} multiline>
      {/* tabIndex: the tooltip is the only surface for sync/encryption info —
          keyboard focus must be able to trigger it */}
      <Badge
        size="sm"
        variant="light"
        color={color}
        leftSection={icon}
        tabIndex={0}
        aria-label={`Sync status: ${label}`}
        data-testid={`sync-status-${status}`}
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
