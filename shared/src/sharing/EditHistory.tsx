import { useState } from "react";
import { Paper, Group, Text, Badge, Stack, UnstyledButton, ScrollArea } from "@mantine/core";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import { useEditChain, useMembers, type EditHistoryEntry } from "betterbase/sync/react";
import type { SpaceFields, Member } from "betterbase/sync";
import type { EditDiff } from "betterbase/crypto";

interface EditHistoryProps {
  record: (SpaceFields & Record<string, unknown>) | null | undefined;
  fieldLabels?: Record<string, string>;
}

function resolveAuthor(did: string, members: Member[]): string {
  const member = members.find((m) => m.did === did);
  if (member?.handle) return member.handle;
  if (did.length <= 24) return did;
  return `${did.slice(0, 16)}...${did.slice(-8)}`;
}

function relativeTime(ms: number): string {
  const delta = Date.now() - ms;
  if (delta < 60_000) return "just now";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function describeDiff(diff: EditDiff, fieldLabels?: Record<string, string>): string {
  const label = fieldLabels?.[diff.path] ?? diff.path;
  if (diff.del) return `Removed ${label}`;
  if (diff.from == null) return `Added ${label}`;
  const from = typeof diff.from === "string" ? diff.from : JSON.stringify(diff.from);
  const to = typeof diff.to === "string" ? diff.to : JSON.stringify(diff.to);
  const truncFrom = from.length > 30 ? from.slice(0, 30) + "…" : from;
  const truncTo = to.length > 30 ? to.slice(0, 30) + "…" : to;
  return `Changed ${label} from "${truncFrom}" to "${truncTo}"`;
}

export function EditHistory({ record, fieldLabels }: EditHistoryProps) {
  const chain = useEditChain(record);
  const { members } = useMembers(record?._spaceId);
  const [open, setOpen] = useState(false);

  if (!chain || chain.entries.length === 0) return null;

  const entries = [...chain.entries].reverse();

  return (
    <Stack gap={0} align="flex-end">
      <UnstyledButton
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 4 }}
        title="Edit history"
      >
        <History size={16} />
        <Text size="sm" c="dimmed">
          {chain.entries.length}
        </Text>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </UnstyledButton>

      {open && (
        <Paper withBorder p="sm" mt={4} w={320} style={{ zIndex: 10, position: "relative" }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                Edit History
              </Text>
              <Badge size="xs" color={chain.valid ? "green" : "red"} variant="light">
                {chain.valid ? "verified" : "chain broken"}
              </Badge>
            </Group>

            <ScrollArea mah={300}>
              <Stack gap="xs">
                {entries.map((entry: EditHistoryEntry) => (
                  <Stack key={`${entry.author}-${entry.timestamp}`} gap={2}>
                    <Group gap={4}>
                      <Text size="xs" fw={500}>
                        {resolveAuthor(entry.author, members)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {relativeTime(entry.timestamp)}
                      </Text>
                    </Group>
                    {entry.diffs.map((diff: EditDiff, j: number) => (
                      <Text
                        key={`${diff.path}-${j}`}
                        size="xs"
                        c="dimmed"
                        style={{ paddingLeft: 8 }}
                      >
                        {describeDiff(diff, fieldLabels)}
                      </Text>
                    ))}
                  </Stack>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
