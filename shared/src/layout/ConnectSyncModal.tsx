import { useState } from "react";
import { Modal, Stack, Text, Button, List, ThemeIcon } from "@mantine/core";
import { HardDrive, Lock, WifiOff } from "lucide-react";

interface ConnectSyncModalProps {
  opened: boolean;
  onClose: () => void;
  /** Starts the OAuth flow. The modal stays open with a loading state until it resolves. */
  onConnect: () => Promise<void>;
  /** Login error to display inside the modal (from useAuth().error). */
  error?: string | null;
}

export function ConnectSyncModal({ opened, onClose, onConnect, error }: ConnectSyncModalProps) {
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await onConnect();
      onClose();
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Sync your data securely" centered size="sm">
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          Your data is encrypted on your device before syncing. The server only stores encrypted
          blobs — it never sees your data.
        </Text>

        <List spacing="sm" size="sm">
          <List.Item
            icon={
              <ThemeIcon size={24} variant="light" radius="xl">
                <HardDrive size={14} />
              </ThemeIcon>
            }
          >
            Data lives on your device first
          </List.Item>
          <List.Item
            icon={
              <ThemeIcon size={24} variant="light" radius="xl">
                <Lock size={14} />
              </ThemeIcon>
            }
          >
            End-to-end encrypted sync
          </List.Item>
          <List.Item
            icon={
              <ThemeIcon size={24} variant="light" radius="xl">
                <WifiOff size={14} />
              </ThemeIcon>
            }
          >
            Works offline, syncs when online
          </List.Item>
        </List>

        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}

        <Button fullWidth loading={connecting} onClick={handleConnect}>
          Continue with Betterbase Account
        </Button>

        <Button fullWidth variant="subtle" color="gray" onClick={onClose} disabled={connecting}>
          Maybe later
        </Button>
      </Stack>
    </Modal>
  );
}
