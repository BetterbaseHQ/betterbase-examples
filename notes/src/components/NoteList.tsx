import { TextInput, ActionIcon, Text, Group, UnstyledButton } from "@mantine/core";
import { Search, Plus, Pin, Star } from "lucide-react";
import { isShared } from "betterbase/sync";
import { ShareButton, MembersPanel } from "@betterbase/examples-shared";
import type { Note, Notebook } from "@/lib/db";

interface NoteListProps {
  notes: Note[];
  /** Precomputed excerpts keyed by note id (avoids re-parsing bodies per render). */
  excerpts: Map<string, string>;
  selectedNoteId: string | null;
  search: string;
  onSearchChange: (search: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  // Sharing props — only provided in the synced path when a notebook is selected
  notebook?: (Notebook & { _spaceId?: string }) | null;
  personalSpaceId?: string | null;
  isAdmin?: boolean;
  onShare?: (handle: string) => Promise<void>;
  onInvite?: (handle: string) => Promise<void>;
  onRemoveMember?: (did: string) => Promise<void>;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function NoteList({
  notes,
  excerpts,
  selectedNoteId,
  search,
  onSearchChange,
  onSelect,
  onCreate,
  notebook,
  personalSpaceId,
  isAdmin = false,
  onShare,
  onInvite,
  onRemoveMember,
}: NoteListProps) {
  const notebookIsShared = notebook != null && isShared(notebook, personalSpaceId);

  return (
    <div
      style={{
        width: 280,
        minWidth: 280,
        borderRight: "1px solid var(--mantine-color-gray-3)",
        display: "flex",
        flexDirection: "column",
        background: "var(--mantine-color-body)",
      }}
    >
      {/* Notebook header with sharing controls (shown when a notebook is selected) */}
      {notebook && (
        <div
          style={{
            padding: "8px 12px 4px",
            borderBottom: "1px solid var(--mantine-color-gray-2)",
          }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" lineClamp={1}>
              {notebook.name}
            </Text>
            {!notebookIsShared && onShare && <ShareButton onShare={onShare} />}
            {notebookIsShared && notebook._spaceId && onInvite && onRemoveMember && (
              <MembersPanel
                spaceId={notebook._spaceId}
                isAdmin={isAdmin}
                onInvite={onInvite}
                onRemoveMember={onRemoveMember}
              />
            )}
          </Group>
        </div>
      )}

      {/* Search + create */}
      <div style={{ padding: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <TextInput
          size="xs"
          placeholder="Search notes..."
          aria-label="Search notes"
          leftSection={<Search size={14} />}
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <ActionIcon variant="light" size="md" aria-label="New note" onClick={onCreate}>
          <Plus size={16} />
        </ActionIcon>
      </div>

      {/* Note list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
        {notes.map((note) => (
          <UnstyledButton
            key={note.id}
            onClick={() => onSelect(note.id)}
            aria-current={note.id === selectedNoteId ? "true" : undefined}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              borderRadius: 6,
              backgroundColor:
                note.id === selectedNoteId ? "var(--mantine-color-indigo-light)" : undefined,
              marginBottom: 2,
            }}
          >
            <Group gap={4} justify="space-between" wrap="nowrap" mb={2}>
              <Text size="sm" fw={500} lineClamp={1} style={{ flex: 1 }}>
                {note.title || "Untitled"}
              </Text>
              <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                {note.pinned && <Pin size={12} color="var(--mantine-color-dimmed)" />}
                {note.favorite && <Star size={12} color="var(--mantine-color-yellow-6)" />}
              </Group>
            </Group>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {excerpts.get(note.id) ?? "No content"}
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              {formatRelativeDate(note.updatedAt)}
            </Text>
          </UnstyledButton>
        ))}

        {notes.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" mt="xl">
            {search ? "No matching notes" : "No notes yet"}
          </Text>
        )}
      </div>
    </div>
  );
}
