import { useState } from "react";
import {
  Stack,
  Text,
  Group,
  Button,
  Paper,
  ActionIcon,
  CopyButton,
  Tooltip,
  TextInput,
  Badge,
} from "@mantine/core";
import { ArrowLeft, Pencil, Trash2, Copy, Check, Eye, EyeOff, ExternalLink } from "lucide-react";
import { ShareButton, MembersPanel } from "@betterbase/examples-shared";
import type { Entry } from "@/lib/db";

const CATEGORY_LABELS: Record<string, string> = {
  login: "Login",
  card: "Card",
  note: "Secure Note",
  identity: "Identity",
};

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

  const isPersonal = entry._spaceId == null || entry._spaceId === personalSpaceId;
  const isShared = entry._spaceId != null && !isPersonal;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="xs">
          <ActionIcon variant="subtle" onClick={onBack}>
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
            onClick={onDelete}
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
                style={{ flex: 1 }}
                styles={{ input: { cursor: "default" } }}
              />
              <ActionIcon variant="subtle" size="sm" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </ActionIcon>
              {entry.password && <CopyField value={entry.password} />}
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

function CopyField({ value }: { value: string }) {
  return (
    <CopyButton value={value} timeout={1500}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
          <ActionIcon variant="subtle" size="sm" color={copied ? "teal" : "gray"} onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}
