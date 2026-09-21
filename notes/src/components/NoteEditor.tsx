import { useState, useEffect, useRef } from "react";
import { Group, ActionIcon, TextInput, Box, Tooltip } from "@mantine/core";
import { Pin, Star, Trash2 } from "lucide-react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { RichTextEditor } from "@mantine/tiptap";
import {
  ConfirmDialog,
  reportError,
  useFlushableDebouncedCallback,
} from "@betterbase/examples-shared";
import { useEditableRecord } from "betterbase/db/react";
import { db, notes } from "@/lib/db";
import type { Note } from "@/lib/db";

interface NoteEditorProps {
  note: Note;
  onDelete: (id: string) => void;
}

export function NoteEditor({ note, onDelete }: NoteEditorProps) {
  // Base-aware editing: the hook delivers the record and its CRDT binary as
  // one atomic pair, so a save can anchor its diff to exactly the version
  // the editor rendered — peer edits that land mid-edit merge instead of
  // being tombstoned by a stale full-value write.
  const { record: live, base } = useEditableRecord(notes, note.id);
  const current = live ?? note;
  const baseRef = useRef<Uint8Array | null>(null);
  baseRef.current = base;

  const noteIdRef = useRef(note.id);
  const [localTitle, setLocalTitle] = useState(note.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const suppressNextUpdate = useRef(false);

  // noteId and base are captured at keystroke time: the debounce replaces
  // its args on every keystroke, so the trailing fire carries the value and
  // the base it was derived from. A peer edit that lands mid-debounce resets
  // the editor content (external-sync effect below) and subsequent
  // keystrokes capture the newer base; if the user stops typing first, the
  // pending write still anchors to the older base and merges.
  //
  // Saves go through db.patch with the explicit noteId (not update()) —
  // flush-on-switch must target the previous note, while update() always
  // patches the currently subscribed record.
  const debouncedSaveBody = useFlushableDebouncedCallback(
    (noteId: string, body: string, base: Uint8Array | null) => {
      db.patch(notes, { id: noteId, body }, base ? { base } : undefined).catch((err) =>
        reportError(err, "Couldn't save note"),
      );
    },
    { delay: 500, flushOnUnmount: true },
  );

  const debouncedSaveTitle = useFlushableDebouncedCallback(
    (noteId: string, title: string, base: Uint8Array | null) => {
      db.patch(notes, { id: noteId, title }, base ? { base } : undefined).catch((err) =>
        reportError(err, "Couldn't save note"),
      );
    },
    { delay: 300, flushOnUnmount: true },
  );

  // External title updates (peer sync) rebase the input. The pending local
  // draft is flushed FIRST — the debounce replaces its args on every
  // keystroke, so without the flush a keystroke after the rebase would
  // discard the un-persisted draft entirely (AUD-046).
  const prevExternalTitle = useRef(current.title);

  const prevNoteId = useRef(note.id);
  useEffect(() => {
    if (prevNoteId.current !== note.id) {
      // Pending args still belong to the previous note — write them through
      debouncedSaveTitle.flush();
      debouncedSaveBody.flush();
      prevNoteId.current = note.id;
      // Rebase the input to the new note explicitly: the title-rebase
      // effect below keys on the title VALUE, so switching to a note with
      // an identical title (e.g. the empty default) would otherwise leave
      // the previous draft displayed and persistable into the new note.
      prevExternalTitle.current = current.title;
      setLocalTitle(current.title);
    }
    noteIdRef.current = note.id;
  }, [note.id, current.title, debouncedSaveTitle, debouncedSaveBody]);

  useEffect(() => {
    if (current.title === prevExternalTitle.current) return;
    prevExternalTitle.current = current.title;
    debouncedSaveTitle.flush();
    setLocalTitle(current.title);
  }, [current.title, debouncedSaveTitle]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Link.configure({ openOnClick: false }),
        Placeholder.configure({ placeholder: "Start writing..." }),
      ],
      content: parseBody(current.body),
      onUpdate: ({ editor: e }) => {
        if (suppressNextUpdate.current) {
          suppressNextUpdate.current = false;
          return;
        }
        debouncedSaveBody(noteIdRef.current, JSON.stringify(e.getJSON()), baseRef.current);
      },
    },
    [note.id],
  );

  // Update editor content when note body changes externally (e.g. from sync)
  useEffect(() => {
    if (!editor) return;
    const currentJson = JSON.stringify(editor.getJSON());
    const parsed = parseBody(current.body);
    const parsedJson = JSON.stringify(parsed);
    if (parsedJson !== currentJson) {
      // AUD-046: write the pending draft through before rebasing the
      // editor to the peer content — the debounce replaces its args on
      // every keystroke, so the next keystroke after the rebase would
      // otherwise discard the un-persisted draft.
      debouncedSaveBody.flush();
      suppressNextUpdate.current = true;
      editor.commands.setContent(parsed);
    }
  }, [editor, current.body, debouncedSaveBody]);

  const handleTitleChange = (title: string) => {
    setLocalTitle(title);
    debouncedSaveTitle(noteIdRef.current, title, baseRef.current);
  };

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
          aria-label="Note title"
          value={localTitle}
          onChange={(e) => handleTitleChange(e.currentTarget.value)}
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
        <Tooltip label={current.pinned ? "Unpin" : "Pin"}>
          <ActionIcon
            variant={current.pinned ? "filled" : "subtle"}
            aria-label={current.pinned ? "Unpin note" : "Pin note"}
            onClick={() =>
              // LWW boolean — patch by id, no base and no loaded-check
              // (clicks during the hook's initial delivery still save)
              db
                .patch(notes, { id: note.id, pinned: !current.pinned })
                .catch((err) => reportError(err, "Couldn't save note"))
            }
          >
            <Pin size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={current.favorite ? "Unfavorite" : "Favorite"}>
          <ActionIcon
            variant={current.favorite ? "filled" : "subtle"}
            color="yellow"
            aria-label={current.favorite ? "Remove from favorites" : "Add to favorites"}
            onClick={() =>
              db
                .patch(notes, { id: note.id, favorite: !current.favorite })
                .catch((err) => reportError(err, "Couldn't save note"))
            }
          >
            <Star size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Delete">
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label="Delete note"
            onClick={() => setConfirmDelete(true)}
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

      <ConfirmDialog
        opened={confirmDelete}
        title="Delete note"
        message="Delete this note? This cannot be undone."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          // Flush pending edits first so the delete cleanly wins instead of
          // racing a debounce-fired patch against a tombstoned record
          debouncedSaveTitle.flush();
          debouncedSaveBody.flush();
          onDelete(note.id);
        }}
      />
    </Box>
  );
}

function parseBody(body: string): Record<string, unknown> {
  if (!body) return { type: "doc", content: [{ type: "paragraph" }] };
  try {
    return JSON.parse(body);
  } catch {
    // body is a t.text() CRDT string of serialized tiptap JSON; a character
    // merge of concurrent structural edits can produce unparseable JSON.
    // Render the raw text instead of losing the content.
    return {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: body }] }],
    };
  }
}
