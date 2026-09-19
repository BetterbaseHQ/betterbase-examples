import { useState, useEffect } from "react";
import {
  Stack,
  Text,
  Group,
  Button,
  Paper,
  ActionIcon,
  Tooltip,
  TextInput,
  Badge,
} from "@mantine/core";
import { ArrowLeft, Pencil, Trash2, Copy, Check, Eye, EyeOff, ExternalLink } from "lucide-react";
import { ConfirmDialog, ShareButton, MembersPanel } from "@betterbase/examples-shared";
import { copySecret, cancelPendingClear } from "@/lib/clipboard";
import type { Entry } from "@/lib/db";

const CATEGORY_LABELS: Record<string, string> = {
  login: "Login",
  card: "Card",
  note: "Secure Note",
  identity: "Identity",
};

/** Re-mask a revealed secret after this long, even if the user walks away. */
const REVEAL_TIMEOUT_MS = 60_000;

interface EntryDetailProps {
  entry: Entry & { _spaceId?: string };
  personalSpaceId?: string | null;
  isAdmin?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
  onShare?: (handle: string) => Promise<void>;
  onInvite?: (handle: string) => Promise<void>;
  onRemoveMember?: (did: string) => Promise<void>;
}

export function EntryDetail({
  entry,
  personalSpaceId,
  isAdmin = false,
  onEdit,
  onDelete,
  onBack,
  onShare,
  onInvite,
  onRemoveMember,
}: EntryDetailProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Never leave a revealed secret on screen: re-mask when the tab is hidden
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") setShowPassword(false);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // ...and after a bounded reveal window
  useEffect(() => {
    if (!showPassword) return;
    const t = setTimeout(() => setShowPassword(false), REVEAL_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [showPassword]);

  // ...or when switching entries
  useEffect(() => {
    setShowPassword(false);
  }, [entry.id]);

  const isPersonal = entry._spaceId == null || entry._spaceId === personalSpaceId;
  const isShared = entry._spaceId != null && !isPersonal;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="xs">
          <ActionIcon variant="subtle" aria-label="Back to list" onClick={onBack}>
            <ArrowLeft size={18} />
          </ActionIcon>
          <Text fw={600} size="xl">
            {entry.site || "Untitled"}
          </Text>
          <Badge variant="light" size="sm">
            {CATEGORY_LABELS[entry.category] ?? entry.category}
          </Badge>
        </Group>
        <Group gap="xs">
          {isPersonal && onShare && <ShareButton onShare={onShare} />}
          {isShared && entry._spaceId && onInvite && onRemoveMember && (
            <MembersPanel
              spaceId={entry._spaceId}
              isAdmin={isAdmin}
              onInvite={onInvite}
              onRemoveMember={onRemoveMember}
            />
          )}
          <Button variant="light" leftSection={<Pencil size={14} />} size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="light"
            color="red"
            leftSection={<Trash2 size={14} />}
            size="sm"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        </Group>
      </Group>

      <Paper p="md" withBorder>
        <Stack gap="md">
          {entry.url && (
            <FieldRow label="URL">
              <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" truncate style={{ flex: 1 }}>
                  {entry.url}
                </Text>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  component="a"
                  aria-label="Open site"
                  href={entry.url.startsWith("http") ? entry.url : `https://${entry.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={14} />
                </ActionIcon>
              </Group>
            </FieldRow>
          )}

          <FieldRow label="Username">
            <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" truncate style={{ flex: 1 }}>
                {entry.username || "\u2014"}
              </Text>
              {entry.username && <CopyField value={entry.username} />}
            </Group>
          </FieldRow>

          <FieldRow label="Password">
            <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <TextInput
                value={entry.password}
                type={showPassword ? "text" : "password"}
                readOnly
                variant="unstyled"
                size="sm"
                aria-label="Password"
                autoComplete="off"
                style={{ flex: 1 }}
                styles={{ input: { cursor: "default" } }}
              />
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </ActionIcon>
              {entry.password && <CopyField value={entry.password} secret />}
            </Group>
          </FieldRow>

          {entry.notes && (
            <FieldRow label="Notes">
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {entry.notes}
              </Text>
            </FieldRow>
          )}

          <Group gap="lg">
            <Text size="xs" c="dimmed">
              Created {entry.createdAt.toLocaleDateString()}
            </Text>
            <Text size="xs" c="dimmed">
              Modified {entry.updatedAt.toLocaleDateString()}
            </Text>
          </Group>
        </Stack>
      </Paper>

      <ConfirmDialog
        opened={confirmDelete}
        title="Delete entry"
        message={
          isShared ? (
            <>
              Delete <b>{entry.site || "Untitled"}</b>? It is shared — this deletes it for everyone
              and cannot be undone.
            </>
          ) : (
            <>
              Delete <b>{entry.site || "Untitled"}</b>? This cannot be undone.
            </>
          )
        }
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
      />
    </Stack>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="xs" fw={500} c="dimmed">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

function CopyField({ value, secret = false }: { value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      if (secret) {
        await copySecret(value);
      } else {
        // Don't let a pending secret auto-clear wipe what we just copied
        cancelPendingClear();
        await navigator.clipboard.writeText(value);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access denied — nothing to do
    }
  };
  return (
    <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
      <ActionIcon
        variant="subtle"
        size="sm"
        color={copied ? "teal" : "gray"}
        aria-label={`Copy ${secret ? "password" : "value"} to clipboard`}
        onClick={handleCopy}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </ActionIcon>
    </Tooltip>
  );
}
