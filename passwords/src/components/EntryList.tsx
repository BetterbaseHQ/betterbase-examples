import type { ReactNode } from "react";
import { TextInput, ActionIcon, Stack, Text, Paper, Group, Button } from "@mantine/core";
import { Search, Plus, Globe, CreditCard, StickyNote, User, Users } from "lucide-react";
import type { Entry } from "@/lib/db";

const CATEGORY_ICONS: Record<string, ReactNode> = {
  login: <Globe size={16} />,
  card: <CreditCard size={16} />,
  note: <StickyNote size={16} />,
  identity: <User size={16} />,
};

interface EntryListProps {
  entries: readonly (Entry & { _spaceId?: string })[];
  personalSpaceId?: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  emptyState: ReactNode;
}

export function EntryList({
  entries,
  personalSpaceId,
  search,
  onSearchChange,
  onSelect,
  onCreate,
  emptyState,
}: EntryListProps) {
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <TextInput
          placeholder="Search passwords..."
          leftSection={<Search size={16} />}
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button leftSection={<Plus size={16} />} onClick={onCreate}>
          Add
        </Button>
      </Group>

      {entries.length === 0 ? (
        emptyState
      ) : (
        <Stack gap="xs">
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              personalSpaceId={personalSpaceId}
              onSelect={onSelect}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function EntryRow({
  entry,
  personalSpaceId,
  onSelect,
}: {
  entry: Entry & { _spaceId?: string };
  personalSpaceId?: string | null;
  onSelect: (id: string) => void;
}) {
  const isShared = entry._spaceId != null && entry._spaceId !== personalSpaceId;

  return (
    <Paper p="sm" withBorder style={{ cursor: "pointer" }} onClick={() => onSelect(entry.id)}>
      <Group gap="sm" wrap="nowrap">
        <ActionIcon variant="light" color="gray" size="lg" radius="md">
          {CATEGORY_ICONS[entry.category] ?? <Globe size={16} />}
        </ActionIcon>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={500} truncate>
            {entry.site || "Untitled"}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {entry.username}
          </Text>
        </Stack>
        {isShared && <Users size={12} color="var(--mantine-color-blue-5)" />}
      </Group>
    </Paper>
  );
}
