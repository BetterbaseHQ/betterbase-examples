import { useState, useEffect, useRef } from "react";
import { Group, ActionIcon, TextInput, Box, Tooltip } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { Pin, Star, Trash2 } from "lucide-react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { RichTextEditor } from "@mantine/tiptap";
import type { Note } from "@/lib/db";

interface NoteEditorProps {
  note: Note;
  onUpdate: (id: string, patch: Partial<Omit<Note, "id" | "createdAt" | "updatedAt">>) => void;
  onDelete: (id: string) => void;
}

export function NoteEditor({ note, onUpdate, onDelete }: NoteEditorProps) {
  const noteIdRef = useRef(note.id);
  const [localTitle, setLocalTitle] = useState(note.title);
  const suppressNextUpdate = useRef(false);

  // noteId is passed as argument (captured at call time) so switching notes
  // won't cause saves to target the wrong record. The editor is also recreated
  // on note change via the [note.id] dependency, which cancels pending timers.
  const debouncedSaveBody = useDebouncedCallback((noteId: string, body: string) => {
    onUpdate(noteId, { body });
  }, 500);

  const debouncedSaveTitle = useDebouncedCallback((noteId: string, title: string) => {
    onUpdate(noteId, { title });
  }, 300);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Link.configure({ openOnClick: false }),
        Placeholder.configure({ placeholder: "Start writing..." }),
      ],
      content: parseBody(note.body),
      onUpdate: ({ editor: e }) => {
        if (suppressNextUpdate.current) {
          suppressNextUpdate.current = false;
          return;
        }
        debouncedSaveBody(noteIdRef.current, JSON.stringify(e.getJSON()));
      },
    },
    [note.id],
  );

  // Sync refs and local state when note changes
  useEffect(() => {
    noteIdRef.current = note.id;
    setLocalTitle(note.title);
  }, [note.id, note.title]);

  // Update editor content when note body changes externally (e.g. from sync)
  useEffect(() => {
    if (!editor) return;
    const currentJson = JSON.stringify(editor.getJSON());
    const parsed = parseBody(note.body);
    const parsedJson = JSON.stringify(parsed);
    if (parsedJson !== currentJson) {
      suppressNextUpdate.current = true;
      editor.commands.setContent(parsed);
    }
  }, [editor, note.body]);

  return (
    <Box
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Header bar */}
      <Group
        gap="xs"
        p="xs"
        wrap="nowrap"
        style={{
          borderBottom: "1px solid var(--mantine-color-gray-3)",
        }}
      >
        <TextInput
          variant="unstyled"
          placeholder="Untitled"
          value={localTitle}
          onChange={(e) => {
            const title = e.currentTarget.value;
            setLocalTitle(title);
            debouncedSaveTitle(noteIdRef.current, title);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
              editor?.commands.focus();
            }
            if (e.key === "Escape") {
              e.currentTarget.blur();
            }
          }}
          size="lg"
          fw={600}
          style={{ flex: 1 }}
        />
        <Tooltip label={note.pinned ? "Unpin" : "Pin"}>
          <ActionIcon
            variant={note.pinned ? "filled" : "subtle"}
            onClick={() => onUpdate(note.id, { pinned: !note.pinned })}
          >
            <Pin size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={note.favorite ? "Unfavorite" : "Favorite"}>
          <ActionIcon
            variant={note.favorite ? "filled" : "subtle"}
            color="yellow"
            onClick={() => onUpdate(note.id, { favorite: !note.favorite })}
          >
            <Star size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Delete">
          <ActionIcon
            variant="subtle"
            color="red"
            onClick={() => {
              if (window.confirm("Delete this note?")) {
                onDelete(note.id);
              }
            }}
          >
            <Trash2 size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* TipTap Editor */}
      <Box style={{ flex: 1, overflow: "auto" }}>
        <RichTextEditor editor={editor} styles={{ root: { border: "none" } }}>
          <RichTextEditor.Toolbar>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Bold />
              <RichTextEditor.Italic />
              <RichTextEditor.Strikethrough />
              <RichTextEditor.Code />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.H1 />
              <RichTextEditor.H2 />
              <RichTextEditor.H3 />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.BulletList />
              <RichTextEditor.OrderedList />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Blockquote />
              <RichTextEditor.CodeBlock />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Link />
              <RichTextEditor.Unlink />
            </RichTextEditor.ControlsGroup>
          </RichTextEditor.Toolbar>

          <RichTextEditor.Content />
        </RichTextEditor>
      </Box>
    </Box>
  );
}

function parseBody(body: string): Record<string, unknown> {
  if (!body) return { type: "doc", content: [{ type: "paragraph" }] };
  try {
    return JSON.parse(body);
  } catch {
    return {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: body }] }],
    };
  }
}
