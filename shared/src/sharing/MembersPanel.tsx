import { useMemo, useState } from "react";
import {
  Group,
  Text,
  Badge,
  ActionIcon,
  TextInput,
  Button,
  Stack,
  UnstyledButton,
  Popover,
} from "@mantine/core";
import { Users, ChevronDown, ChevronUp, X, Check } from "lucide-react";
import { useMembers, usePeers } from "betterbase/sync/react";
import type { Member, SpaceRole } from "betterbase/sync";
import { useAuth } from "../auth.js";

interface MembersPanelProps {
  spaceId: string;
  isAdmin: boolean;
  onInvite: (handle: string) => Promise<void>;
  onRemoveMember: (did: string) => Promise<void>;
}

const ROLE_COLORS: Record<SpaceRole, string> = {
  admin: "violet",
  write: "blue",
  read: "gray",
};

const STATUS_COLORS = {
  joined: "green",
  pending: "yellow",
  declined: "red",
  revoked: "gray",
} as const;

function memberStatus(
  member: Member,
  onlineHandles: Set<string>,
): { label: string; color: string } {
  if (member.status !== "joined") {
    return { label: member.status, color: STATUS_COLORS[member.status] };
  }
  const isOnline = member.handle != null && onlineHandles.has(member.handle);
  return isOnline ? { label: "online", color: "green" } : { label: "offline", color: "gray" };
}

function truncateDid(did: string): string {
  if (did.length <= 24) return did;
  return `${did.slice(0, 16)}...${did.slice(-8)}`;
}

export function MembersPanel({ spaceId, isAdmin, onInvite, onRemoveMember }: MembersPanelProps) {
  const { handle: myHandle } = useAuth();
  const { members, loading } = useMembers(spaceId);
  const peers = usePeers<{ handle: string }>(spaceId);
  const [open, setOpen] = useState(false);
  const [inviteHandle, setInviteHandle] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [confirmingDid, setConfirmingDid] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState("");

  const activeCount = members.filter((m: Member) => m.status === "joined").length;
  const onlineHandles = useMemo(() => {
    const handles = peers.map((p) => p.data?.handle).filter((h): h is string => Boolean(h));
    if (myHandle) handles.push(myHandle);
    return new Set(handles);
  }, [peers, myHandle]);

  const handleInvite = async () => {
    const h = inviteHandle.trim();
    if (!h) return;
    setInviting(true);
    setInviteError("");
    try {
      await onInvite(h);
      setInviteHandle("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (did: string) => {
    if (confirmingDid !== did) {
      setConfirmingDid(did);
      return;
    }
    setRemoving(did);
    setConfirmingDid(null);
    setRemoveError("");
    try {
      await onRemoveMember(did);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Popover
      opened={open}
      onChange={(next) => {
        setOpen(next);
        if (!next) setConfirmingDid(null);
      }}
      position="bottom-end"
      shadow="md"
      width={280}
    >
      <Popover.Target>
        <UnstyledButton
          onClick={() => setOpen((o) => !o)}
          style={{ display: "flex", alignItems: "center", gap: 4 }}
          title="Members"
        >
          <Users size={16} />
          <Text size="sm" c="dimmed">
            {loading ? "…" : activeCount}
          </Text>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </UnstyledButton>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            Members
          </Text>

          {members.map((member: Member) => {
            const status = memberStatus(member, onlineHandles);
            return (
              <Group key={member.did} justify="space-between" wrap="nowrap">
                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" truncate>
                    {member.handle ?? truncateDid(member.did)}
                  </Text>
                  <Group gap={4}>
                    <Badge size="xs" color={ROLE_COLORS[member.role]} variant="light">
                      {member.role}
                    </Badge>
                    <Badge size="xs" color={status.color} variant="dot">
                      {status.label}
                    </Badge>
                  </Group>
                </Stack>
                {isAdmin && member.status === "joined" && member.handle !== myHandle && (
                  <ActionIcon
                    size="xs"
                    variant={confirmingDid === member.did ? "filled" : "subtle"}
                    color={confirmingDid === member.did ? "red" : "gray"}
                    loading={removing === member.did}
                    onClick={() => handleRemove(member.did)}
                    aria-label={
                      confirmingDid === member.did ? "Confirm remove member" : "Remove member"
                    }
                  >
                    {confirmingDid === member.did ? <Check size={10} /> : <X size={10} />}
                  </ActionIcon>
                )}
              </Group>
            );
          })}

          {members.length === 0 && !loading && (
            <Text size="xs" c="dimmed">
              No members yet
            </Text>
          )}

          {removeError && (
            <Text size="xs" c="red">
              {removeError}
            </Text>
          )}

          {isAdmin && (
            <Stack gap={4} mt={4}>
              <TextInput
                size="xs"
                placeholder="user@domain"
                value={inviteHandle}
                onChange={(e) => {
                  setInviteHandle(e.currentTarget.value);
                  if (inviteError) setInviteError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleInvite();
                }}
                error={inviteError || undefined}
              />
              <Button
                size="xs"
                variant="light"
                loading={inviting}
                disabled={!inviteHandle.trim()}
                onClick={handleInvite}
              >
                Invite
              </Button>
            </Stack>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
