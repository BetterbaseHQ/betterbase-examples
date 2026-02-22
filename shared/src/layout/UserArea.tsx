import { useState } from "react";
import { Button, Menu, Avatar, Group, Text, Divider } from "@mantine/core";
import { LogOut, ExternalLink } from "lucide-react";
import { ConnectSyncModal } from "./ConnectSyncModal.js";
import { SyncStatusBadge, type SyncStatus } from "./SyncStatusBadge.js";

interface UserAreaProps {
  isAuthenticated: boolean;
  handle: string | null;
  syncStatus?: SyncStatus;
  onLogin: () => Promise<void>;
  onLogout: () => void;
}

function getInitials(handle: string): string {
  const local = handle.split("@")[0] ?? handle;
  const parts = local
    .split(/[.\s_-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .filter(Boolean);
  return parts.length > 0 ? parts.join("") : "?";
}

function getSyncLabel(status: SyncStatus): { label: string; color: string } {
  switch (status) {
    case "synced":
      return { label: "Synced", color: "green" };
    case "syncing":
      return { label: "Syncing...", color: "blue" };
    case "offline":
      return { label: "Offline", color: "gray" };
    case "error":
      return { label: "Sync error", color: "yellow" };
  }
}

export function UserArea({
  isAuthenticated,
  handle,
  syncStatus = "synced",
  onLogin,
  onLogout,
}: UserAreaProps) {
  const [modalOpened, setModalOpened] = useState(false);

  if (!isAuthenticated) {
    return (
      <>
        <Button
          variant="light"
          size="compact-sm"
          rightSection={<ExternalLink size={14} />}
          onClick={() => setModalOpened(true)}
        >
          Connect Sync
        </Button>
        <ConnectSyncModal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          onConnect={async () => {
            setModalOpened(false);
            await onLogin();
          }}
        />
      </>
    );
  }

  const initials = handle ? getInitials(handle) : "?";
  const sync = getSyncLabel(syncStatus);

  return (
    <Group gap="xs">
      <SyncStatusBadge status={syncStatus} />
      <Menu shadow="md" width={200} position="bottom-end">
        <Menu.Target>
          <Avatar size="sm" radius="xl" color="indigo" style={{ cursor: "pointer" }}>
            {initials}
          </Avatar>
        </Menu.Target>
        <Menu.Dropdown>
          {handle && (
            <>
              <Menu.Label>{handle}</Menu.Label>
              <Divider />
            </>
          )}
          <Menu.Item closeMenuOnClick={false}>
            <Group gap="xs">
              <Text
                size="xs"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: `var(--mantine-color-${sync.color}-6)`,
                  display: "inline-block",
                  flexShrink: 0,
                }}
                component="span"
              />
              <Text size="sm">{sync.label}</Text>
            </Group>
          </Menu.Item>
          <Divider />
          <Menu.Item leftSection={<LogOut size={14} />} onClick={onLogout}>
            Disconnect
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
