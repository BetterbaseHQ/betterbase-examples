# Board — collaborative Kanban

Shared Kanban boards with end-to-end encrypted sync. Runs on port 5384 (`pnpm dev`).

## Schema lesson: split the tree

Columns and cards are separate records, not embedded arrays (`src/lib/collections.ts`).
An embedded array is one CRDT register — concurrent edits by two peers resolve to a
single winner, silently dropping the other peer's column. As separate records, every
peer's edit is an independent write that merges cleanly.

Deleting a board cascades via the declared parent edges: `columns` declares `boardId`,
`cards` declares `columnId`, and `deleteTree` walks the chain deepest-first. Note the
descent follows the edges — a card whose column was already tombstoned (dangling
`columnId`) survives a board delete; queries already tolerate such orphans.

## Fractional drag-drop ordering

Dropping a card never renumbers the column: the card gets the midpoint order of its
neighbors (`(before + after) / 2`), with card id as the tie-breaker
(`src/components/BoardView.tsx`). Two peers can reorder cards in the same column
without conflicting over a shared sequence.

## Optimistic UI with per-card rollback

A drag applies to the UI immediately as a pending override while the patch persists
asynchronously. Each card's override clears individually once the db catches up — or
rolls back just that card if its write fails, leaving newer drags intact.

## Sharing: children first, with FK remap

Sharing a board (`src/lib/sync.ts`) creates a shared space, moves cards then columns
(children first, remapping `columnId` foreign keys per record), moves the board last,
then patches `boardId` foreign keys and invites. Children-first keeps intermediate
failures retryable — children keep the old `boardId` until the final patch, so the
board still renders and a retry re-finds them. The sequence is deliberately **not
transactional**: a mid-share failure can leave children temporarily in the shared
space until a retry converges. (This is the documented extension point beyond the
SDK's single-record `shareTree`.)

## Removal re-keys the board

Removing a member from a shared board is a full key rotation: UCANs revoked,
the space advanced to a fresh key with `set_min_epoch` (the server rejects
the removed device's stale-epoch writes immediately), every DEK rewrapped,
and the membership log rebuilt under the new key. The admin sees
"Space re-keyed — {handle} no longer has access" with the new epoch number;
the removed member's board freezes — columns, cards, and drag-drop replaced
by a re-key notice, and moves made after the rotation never arrive on their
device (the pre-removal local copy stays until they delete it — that's the
honest local-first guarantee).

## Try it: two tabs, one card

1. Sign in, create a board, add a card (`pnpm dev` → http://localhost:5384).
2. In a second tab, sign in as another user and share the board with them.
3. Accept the invitation in tab 2 — both tabs show the same board live.
4. Drag the same card in both tabs: each drop is a fractional-order CRDT patch, and
   both moves merge without losing either edit.
