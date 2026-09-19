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
  const [attempted, setAttempted] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    setAttempted(true);
    try {
      await onConnect();
      onClose();
    } catch {
      // The error is captured in auth context state and rendered below —
      // keep the modal open so the user can see it and retry
    } finally {
      setConnecting(false);
    }
  };

  const handleClose = () => {
    setAttempted(false);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Sync your data securely"
      centered
      size="sm"
      closeOnEscape={!connecting}
      closeOnClickOutside={!connecting}
    >
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

        {/* Only show the error once the user has attempted a connect here —
            session restore errors from a past visit aren't actionable now */}
        {attempted && error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}

        <Button fullWidth loading={connecting} onClick={handleConnect}>
          Continue with Betterbase Account
        </Button>

        <Button fullWidth variant="subtle" color="gray" onClick={handleClose} disabled={connecting}>
          Maybe later
        </Button>
      </Stack>
    </Modal>
  );
}
