import { type ReactNode } from "react";
import { Modal, Stack, Text, Button, Group } from "@mantine/core";

interface ConfirmDialogProps {
  opened: boolean;
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  /** Destructive styling for the confirm button (default: true) */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Small confirmation modal for destructive actions. */
export function ConfirmDialog({
  opened,
  title = "Are you sure?",
  message,
  confirmLabel = "Delete",
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal opened={opened} onClose={onCancel} title={title} centered size="sm">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {message}
        </Text>
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onCancel}>
            Cancel
          </Button>
          <Button color={destructive ? "red" : undefined} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
