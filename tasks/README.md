# Tasks — the simplest full example

Offline-first todo lists with end-to-end encrypted sync. Runs on port 5381
(`just dev` from the workspace root). If you read one app's source, read
this one: it exercises the whole platform — local-first storage, reactive
queries, anonymous→account adoption, sharing, CRDT merge — in a few hundred
lines, and every other app is this app plus one more idea.

## Schema lesson: an embedded array is fine here

`src/lib/collections.ts` embeds todos as an array inside the list record:

```ts
export const lists = collection("lists")
  .v(1, {
    name: t.string(),
    color: t.string(),
    todos: t.array(
      t.object({
        id: t.string(),
        text: t.text(), // CRDT text — merges character-by-character
        completed: t.boolean(),
      }),
    ),
  })
  .build();
```

Two todos added concurrently to the same list merge cleanly (array elements
are independent CRDT writes), and two peers typing in the _same_ todo merge
character-by-character. What an embedded array can't give you is independent
concurrent edits to the _container itself_ — that's the lesson
[board](../board) adds with its split tree.

## The shape to copy

- `src/lib/collections.ts` — the schema (above).
- `src/lib/db.ts` — ~40 lines. Owns the live `db` binding and delegates to
  `createScopedAppDb` from the shared kit: anonymous namespace by default,
  `tasks_<scope-hash>` per signed-in account (one account's decrypted
  records are never visible to another, AUD-045), anonymous data adopted
  into the first account opened on the profile.
- `src/main.tsx` — three lines of substance: `<AppRoot appName="tasks">`
  (shared kit) wraps the app in Mantine + the SDK's OAuth provider.
- `App.tsx` — the local/synced duality: unauthenticated users get the local
  app (`useQuery` from `betterbase/db/react`), authenticated users get
  `ScopedAppTree` → the synced app (`useLists` domain hook).
- `src/lib/todos.ts` — todo edits read the record with its CRDT base and
  patch against it (`getWithBase` + `patch(def, { ...fields, id, base })`),
  so a patch never clobbers a peer's concurrent edit; a per-list write mutex
  serializes read-modify-write cycles.
- `src/lib/sync.ts` — the domain hook pattern (`useLists`): wraps the SDK's
  `useSyncDb`/`useSpaces`/`useQuery` (from `betterbase/sync/react`) plus
  app operations like `shareList` (SDK `shareTree` + invite).

## Try it: two tabs, one list

1. Open [localhost:5381](http://localhost:5381) — no account yet. Create a
   list and some todos; everything works offline (data lives in your
   browser, encrypted at the sync boundary, not at rest).
2. Sign in (Connect Sync). Your anonymous data is adopted into the account —
   nothing is lost, and from now on it syncs.
3. Open a second tab, sign in as another user, and share the list with them
   (share button → their handle). They accept the invitation and see the
   list live.
4. Check a todo off in both tabs at once — both edits land; there is no
   conflict to resolve.

## Testing

`pnpm -C tasks check` runs the browser-mode vitest suite against the real
local database (no network): interleaved todo writes against the CRDT base
(AUD-049), scope isolation and adoption (`lib/db.test.ts`), and the
provider-pin regression for scope swaps. The sync boundary is stubbed with
the SDK's `betterbase/testing` doubles — see the alias setup in
`vitest.browser.config.ts`.
