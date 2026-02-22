import { Group, Text, Tooltip } from "@mantine/core";
import { ShieldCheck, ShieldAlert } from "lucide-react";

interface EncryptionIndicatorProps {
  isAuthenticated: boolean;
  hasError?: boolean;
  errorMessage?: string;
}

export function EncryptionIndicator({
  isAuthenticated,
  hasError,
  errorMessage,
}: EncryptionIndicatorProps) {
  if (hasError) {
    return (
      <Tooltip label={errorMessage || "Sync error"} position="bottom">
        <Group gap={6} wrap="nowrap">
          <ShieldAlert size={18} color="var(--mantine-color-yellow-6)" />
          <Text size="sm" c="yellow.6" visibleFrom="xs">
            Encrypted
          </Text>
        </Group>
      </Tooltip>
    );
  }

  if (isAuthenticated) {
    return (
      <Tooltip
        label="Your data is end-to-end encrypted. The server only stores encrypted blobs."
        position="bottom"
        maw={280}
        multiline
      >
        <Group gap={6} wrap="nowrap">
          <ShieldCheck size={18} color="var(--mantine-color-green-6)" />
          <Text size="sm" c="green.6" visibleFrom="xs">
            Encrypted
          </Text>
        </Group>
      </Tooltip>
    );
  }

  return (
    <Tooltip label="Your data is stored on this device" position="bottom">
      <Group gap={6} wrap="nowrap">
        <ShieldCheck size={18} color="var(--mantine-color-gray-5)" />
        <Text size="sm" c="dimmed" visibleFrom="xs">
          Local
        </Text>
      </Group>
    </Tooltip>
  );
}
