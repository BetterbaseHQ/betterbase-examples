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
import { useMembers, usePeers, useSpaceStatus } from "betterbase/sync/react";
import type { Member, SpaceRole } from "betterbase/sync";
import { useAuth } from "betterbase/auth/react";
import { truncateDid } from "./did.js";

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

export function MembersPanel({ spaceId, isAdmin, onInvite, onRemoveMember }: MembersPanelProps) {
  const { handle: myHandle } = useAuth();
  const { members, loading, error: membersError } = useMembers(spaceId);
  const peers = usePeers<{ handle: string }>(spaceId);
  const { epoch } = useSpaceStatus(spaceId);
  const [open, setOpen] = useState(false);
  const [inviteHandle, setInviteHandle] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [confirmingDid, setConfirmingDid] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [rekeyedHandle, setRekeyedHandle] = useState<string | null>(null);

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

  const handleRemove = async (did: string, handle: string | null) => {
    if (confirmingDid !== did) {
      setConfirmingDid(did);
      return;
    }
    setRemoving(did);
    setConfirmingDid(null);
    setRemoveError("");
    setRekeyedHandle(null);
    try {
      await onRemoveMember(did);
      // Removal is a full re-key: every DEK rewrapped under a fresh key
      // before the promise resolves. Show who lost access — the epoch
      // number comes live from useSpaceStatus, so it reflects the
      // rotation this await just landed.
      setRekeyedHandle(handle ?? truncateDid(did));
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setRemoving(null);
    }
  };

  const removingHandle =
    removing !== null
      ? (members.find((m: Member) => m.did === removing)?.handle ?? truncateDid(removing))
      : null;

  return (
    <Popover
      opened={open}
      onChange={(next) => {
        setOpen(next);
        if (!next) {
          setConfirmingDid(null);
          setRekeyedHandle(null);
        }
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
                    onClick={() => handleRemove(member.did, member.handle ?? null)}
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

          {membersError && (
            <Text size="xs" c="red">
              Couldn't refresh members: {membersError.message}
            </Text>
          )}

          {members.length === 0 && !loading && !membersError && (
            <Text size="xs" c="dimmed">
              No members yet
            </Text>
          )}

          {removing && (
            <Text size="xs" c="dimmed" data-testid="removing-status">
              Removing {removingHandle} — revoking access and re-keying every record…
            </Text>
          )}

          {rekeyedHandle && !removing && (
            <Stack gap={2} data-testid="rekeyed-notice">
              <Text size="xs" c="teal.7">
                Space re-keyed — {rekeyedHandle} no longer has access.
              </Text>
              {epoch != null && (
                <Text size="xs" c="dimmed">
                  Encryption epoch {epoch}
                </Text>
              )}
            </Stack>
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
                aria-label="Invite user by handle"
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
