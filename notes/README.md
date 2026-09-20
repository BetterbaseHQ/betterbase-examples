# Notes

A local-first notes app with rich text editing. Notebooks contain notes, note bodies sync character-by-character, and everything works offline before it encrypts and syncs. Runs at [localhost:5382](http://localhost:5382).

## What it demonstrates

- **Rich text CRDTs** — note bodies use `t.text()`, so concurrent edits to the same note merge character-by-character instead of clobbering each other
- **Parent/child collections** — `notes` declares its `notebookId` parent edge, so `deleteTree` cascades notebook deletes through the children
- **Sharing with FK migration** — sharing a notebook moves it and its notes into a shared space via `shareTree`, rewriting `notebookId` to the moved notebook's new ID
- **Debounce/delete race handling** — the editor flushes pending edits on note switch and before delete, so a debounced save can never resurrect a deleted note

## Schema

```ts
export const notes = collection("notes")
  .v(1, {
    notebookId: t.string(),
    title: t.string(),
    body: t.text(), // CRDT text — merges character-by-character
    pinned: t.boolean(),
    favorite: t.boolean(),
  })
  .build();
```

## Try it

Run `just dev` from the repo root, then open [localhost:5382](http://localhost:5382). Sign up, create a notebook, and write a note. Now open a second tab, sign in again, open the same note, and type in both tabs — the text merges live in both directions with no conflicts.

See the [examples README](../README.md) for the other apps and how they fit together.
