import { useState } from "react";
import { Button, Menu, Avatar, Group, Text, Divider, UnstyledButton } from "@mantine/core";
import { LogOut, ExternalLink } from "lucide-react";
import { useAuth } from "betterbase/auth/react";
import { ConnectSyncModal } from "./ConnectSyncModal.js";
import { SyncStatusBadge, STATUS_APPEARANCE, type SyncStatus } from "./SyncStatusBadge.js";

interface UserAreaProps {
  isAuthenticated: boolean;
  handle: string | null;
  syncStatus?: SyncStatus;
  /** Detail surfaced in the badge tooltip when syncStatus is "error". */
  syncError?: string;
  onLogin: () => Promise<void>;
  onLogout: () => void;
  /**
   * "sync" (default) — the app syncs data; button/copy say "Connect Sync".
   * "auth" — sign-in only (no sync scope); button/copy say "Sign in".
   */
  mode?: "sync" | "auth";
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

export function UserArea({
  isAuthenticated,
  handle,
  syncStatus = "synced",
  syncError,
  onLogin,
  onLogout,
  mode = "sync",
}: UserAreaProps) {
  const [modalOpened, setModalOpened] = useState(false);
  const { error: authError } = useAuth();

  if (!isAuthenticated) {
    return (
      <>
        <Button
          variant="light"
          size="compact-sm"
          rightSection={<ExternalLink size={14} />}
          onClick={() => setModalOpened(true)}
        >
          {mode === "auth" ? "Sign in" : "Connect Sync"}
        </Button>
        <ConnectSyncModal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          onConnect={onLogin}
          error={authError}
          mode={mode}
        />
      </>
    );
  }

  const initials = handle ? getInitials(handle) : "?";
  const sync = STATUS_APPEARANCE[syncStatus];

  return (
    <Group gap="xs">
      <SyncStatusBadge status={syncStatus} errorDetail={syncError} />
      <Menu shadow="md" width={200} position="bottom-end">
        <Menu.Target>
          <UnstyledButton aria-label="Account menu" style={{ borderRadius: "50%" }}>
            <Avatar size="sm" radius="xl" color="indigo">
              {initials}
            </Avatar>
          </UnstyledButton>
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
