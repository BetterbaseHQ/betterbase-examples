import { ActionIcon, Badge, Group, Tooltip } from "@mantine/core";
import { CloudUpload, RotateCcw } from "lucide-react";
import type { ConnectionStatus } from "betterbase/sync/react";

/**
 * Record-sync status must not claim "Synced" while file bytes are still
 * queued: downgrade the connected-and-idle state to "syncing" when uploads
 * are in flight. Offline/error states pass through unchanged.
 */
export function effectiveSyncStatus(
  connectionStatus: ConnectionStatus,
  pendingUploads: number,
): ConnectionStatus {
  return connectionStatus === "synced" && pendingUploads > 0 ? "syncing" : connectionStatus;
}

/**
 * File-bytes upload status for the header — the record-sync status alone
 * cannot represent queued photo bytes ("Synced" while uploads are still
 * pending or failed). Rendered by apps that use a FileStore.
 */
export interface UploadQueueStatusProps {
  /** Files waiting or currently uploading. */
  pending: number;
  /** Files whose upload failed and can be retried. */
  errored: number;
  /** Retry all failed uploads (from `useFileUploadQueue().retry`). */
  onRetry: () => void;
}

export function UploadQueueStatus({ pending, errored, onRetry }: UploadQueueStatusProps) {
  if (errored > 0) {
    return (
      <Group gap={4} wrap="nowrap">
        <Badge
          size="sm"
          variant="light"
          color="yellow"
          leftSection={<CloudUpload size={12} />}
          data-testid="upload-queue-error"
        >
          {errored} upload{errored === 1 ? "" : "s"} failed
        </Badge>
        <Tooltip label="Retry failed uploads">
          <ActionIcon
            variant="subtle"
            color="yellow"
            size="sm"
            aria-label="Retry failed uploads"
            onClick={() => void onRetry()}
          >
            <RotateCcw size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    );
  }

  if (pending > 0) {
    return (
      <Badge
        size="sm"
        variant="light"
        color="blue"
        leftSection={<CloudUpload size={12} />}
        data-testid="upload-queue-pending"
      >
        Uploading {pending}
      </Badge>
    );
  }

  return null;
}
