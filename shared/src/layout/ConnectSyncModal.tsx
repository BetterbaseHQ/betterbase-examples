import { Modal, Stack, Text, Button, List, ThemeIcon } from "@mantine/core";
import { HardDrive, Lock, WifiOff } from "lucide-react";

interface ConnectSyncModalProps {
  opened: boolean;
  onClose: () => void;
  onConnect: () => void;
}

export function ConnectSyncModal({ opened, onClose, onConnect }: ConnectSyncModalProps) {
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

        <Button fullWidth onClick={onConnect}>
          Continue with Less Account
        </Button>

        <Button fullWidth variant="subtle" color="gray" onClick={onClose}>
          Maybe later
        </Button>
      </Stack>
    </Modal>
  );
}
