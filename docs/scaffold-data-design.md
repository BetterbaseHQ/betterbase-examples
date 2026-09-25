# Scaffold Data: Design Decision

Status: Accepted (2026-09-24; amended after SME review same day)
Applies to: betterbase-examples (apps + shared), betterbase-sync (schema revert + hardening), future best-practice guidance for app builders.

## Context

Example apps seed default/scaffold data ("My Tasks" list, "My Board" + columns,
"My Notebook") so a fresh workspace isn't awkwardly empty. The existing
implementation derived deterministic default-record ids (uuid-v5 of the
collection name under a fixed namespace) so that concurrent seeds on two
devices would collapse via CRDT merge, and built machinery around that:
post-pull emptiness checks, tombstone sampling (no-resurrect), legacy-id
sweeps, pristine-skip at adoption, structural re-seeding after adoption
(`seedChildren`).

This collided with a server invariant: `records.id` was a **globally unique**
primary key, while the entire sync model (cursors, conflict detection,
updates) is per-space. Deterministic default ids are identical across
accounts, so the second account's push failed `records_pkey`, was classified
`internal` (unclassified), and clients retried the wedge forever. During
investigation the global PK was temporarily relaxed to `(space_id, id)`
(sync commit 1f21876 + migration 015). That relaxation is **reverted** by
this decision.

## Options considered (and why rejected)

1. **Composite PK `(space_id, id)`** — abandons the platform guarantee that a
   record id is globally unique. `moveToSpace` already re-identifies records
   precisely to preserve that guarantee; the schema should not contradict it.
   (015's own claim that "federated spaces can legitimately reuse ids" is not
   a reason to relax it: federation mirrors whole spaces — the same ids in
   the *same* space — and shared spaces only receive records via
   `moveToSpace`/`shareTree` re-identification. With random ids, cross-space
   collision is negligible; the global PK is what keeps `moveToSpace`'s
   re-identification contract coherent.)
2. **Account-scoped deterministic ids** (`uuid5(personalSpaceId + name)`) —
   unique by construction and convergent, but requires two id regimes
   (anonymous vs account), re-identification at adoption, and derivation
   ordering assumptions (the class of bug behind the earlier empty-db seeding
   incidents). Works, but heavy.
3. **`seedKey` marker field** — recognition without id semantics; breaks
   cross-device no-resurrect because server tombstones are content-free
   (E2EE) and excluded from full pulls. A fresh device cannot distinguish
   "never seeded" from "seeded and deleted."
4. **Minimal-data tombstones** (encrypted kind hint in tombstone payloads +
   full pulls include them) — the only option that fixes no-resurrect for
   non-cooperating apps, but a wire-protocol and storage-semantics change for
   a problem no sync system in the field has solved either. Parked unless a
   real app needs it.
5. **Ask-the-user on first sync** (iCloud Merge/Discard) — adopted as a
   *component* of the final design (Pattern C).
6. **Onboarding gate** ("start fresh / sign in", Things-style optional sample
   creation) — adopted (Pattern B).

Field research (2026-09-24): no local-first sync system solves this
perfectly. Chrome/Firefox seed system folders as engine-owned fixtures and
still shipped years of duplicate-bookmark bugs; Anytype deletes via
archive-first state; Joplin's creator documents the fresh-device
deletion blind spot; Logseq has open resurrection bugs; Things makes the
Inbox an undeletable fixture and asks about sample projects during
onboarding. Mature systems optimize for *recoverable* failure modes
(user-visible duplicates), not impossibility.

## Decision

**No platform seed machinery.** No seed keys, no deterministic id helpers, no
seeding or merge policy in the SDK. Scaffold data is an application design
concern, addressed by modeling and UX patterns:

**Core semantic: chosen samples are user data from the moment of creation.**
There is no pristine/phantom distinction at adoption, no structural
re-seeding, and no recognition machinery. Whatever the user accepted at
onboarding adopts, syncs, edits, and deletes like any other record. This
follows directly from the review: recognition keyed on declared ids cannot
survive minted ids, pure-content recognition misclassifies user data (a
byte-identical user record would be skipped at adoption and destroyed at
retirement), and skipping pristine samples makes a *chosen* sample vanish at
sign-in. Making samples ordinary data resolves all three at once. The
accepted cost: an untouched sample syncs to every device (a few hundred
bytes of user-chosen data).

### Pattern A — Fixture as structure (undeletable defaults)

An "Inbox"-like default is **not a record**. It is a view backed by reserved
structure: e.g. a `todos` collection with `projectId: string | null`, where
`null` means Inbox; the Inbox renders as the query "todos where projectId is
null". The engine already supports this (`t.optional(t.string())` validates
null; null filters match null-or-absent).

- Undeletable by construction — there is no record to delete.
- Nothing to converge — only the todos sync, each by its own ordinary id.
- No identity, no marker, no platform support required.

**Scope note (from review):** applying this to tasks is a schema *remodel*,
not a view tweak — today's tasks app embeds todos inside list records. The
full remodel (separate todos collection, per-record mutation rewrite, Inbox
as a virtual sidebar entry with an explicit sentinel so "no selection" ≠
"Inbox", sharing via `bulkMoveToSpace`, and a one-time client migration for
existing databases with embedded todos, including legacy `default_<name>`
lists) is documented as the reference implementation of Pattern A and
scheduled as follow-up work. **This pass implements Pattern B for all apps**
(see below) — minimal change, no schema migration, no resurrect risk. Pattern
A ships with tasks when the remodel lands.

### Pattern B — Sample data as ordinary records (deletable scaffolding)

Sample content (a sample list, a sample board + its columns) is ordinary
records with random UUIDs, created **exactly once**, by an explicit user
choice:

- Onboarding offers "Start fresh / Sign in" (chat-style gate; lives **inside
  each app** — launchpad deep-links must hit it). Trigger is a **per-app
  localStorage first-run flag**, never an emptiness check (emptiness
  triggers would re-prompt emptied accounts and reintroduce inferred state).
- The sample-creation prompt ("Create a sample board?") appears only on the
  start-fresh path, in the anonymous phase (Things asks before any sign-in).
- Multi-record samples (board + columns) are created as a unit at prompt
  time; parent/child ids are minted and threaded then.
- Devices that sign in never seed; they receive whatever exists by sync.
- Deletion sticks because nothing re-creates it: creation is tied to a
  one-time user choice, not to any emptiness check.
- An emptied account shows an empty state plus a static, user-initiated
  "add sample" affordance — never an automatic seed.
- Two divergent local lineages merging later can yield a visible duplicate;
  accepted — deletable user data, the imperfection the field accepts.

### Pattern C — Local data meets account data: ask

When a workspace with local records connects to an account that already has
records, prompt: **Merge / Discard**.

- Trigger: at connect, local workspace has ≥1 record AND the first pull
  returned ≥1 record. (With no pristine skip, "has data" is simply "has
  records".)
- **Merge**: adopt local records into the account (existing adoption path),
  then retire the anonymous db — retirement only ever runs after an adoption
  that merged ≥1 record (existing marker semantics).
- **Discard**: skip adoption; **never retire** — the anonymous workspace
  survives as the logged-out copy. Discard must not destroy data.
- Choosing Merge may produce duplicates (including the same sample twice);
  that is the user's arbitration.

### Ids and server schema

- Pure random UUIDs for every record everywhere. No v5 namespace machinery.
- **Migration 016 restores `records(id)` as the globally unique primary key**:
  (1) preflight `SELECT id FROM records GROUP BY id HAVING count(*) > 1` and
  fail with a pointed message if found (see runbook); (2) drop
  `files_record_fk`; (3) drop composite PK; (4) add `PRIMARY KEY (id)`;
  (5) re-add `files_record_fk` against `records(id)`.
- Keep from 1f21876: concurrent same-space INSERT races map to
  `VersionConflict` → conflict path (client reconciles via pull);
  unclassified push errors are traced; the UPDATE is space-scoped.
- **Hardening (from review):** with the global PK, a unique violation can
  mean two different things. Same-space race (the pre-check passed, a
  concurrent writer inserted the same id into the *same* space) →
  `VersionConflict`, reconcile via pull. Cross-space collision (id exists in
  a *different* space — buggy or hostile client) → not a conflict; emit and
  trace a distinct protocol-violation error so it can never silently
  retry-loop again. Distinguish by inspecting the failed insert's constraint
  context.

#### Migration runbook

- **e2e**: `just e2e` runs clean-first (fresh volumes); 015→016 apply with no
  duplicates possible. No action.
- **dev**: `just e2e-clean` does NOT touch dev volumes. Any dev server that
  ran v5 examples has cross-space duplicate ids → 016's preflight fails
  loudly (by design). Remedy: `just dev-down -v` (dev volumes only) — and
  reset dev browser origin storage, since stale client dbs hold edited v5
  records that are valid UUIDs and would wedge post-016.
- **prod**: 015 never shipped (release pin `a333b35` predates `1f21876`).
  Next upgrade applies 015+016 back-to-back — a no-op round trip on data
  that has always had the global PK. No prod data migration for record ids;
  legacy `default_<name>` anonymous records remain handled client-side by
  the adoption guard.

## What gets removed / changed in betterbase-examples

Removed:
- `shared/src/lib/uuid-v5.ts`, `defaultRecordId`, `legacyDefaultRecordId`
- `useDefaultRecord` (post-ready seeding, sweep, tombstone sampling) and all
  call sites
- **Anonymous-phase emptiness seeding**: `LocalTasksApp`'s seed-on-empty
  effect (tasks/src/App.tsx) and `LocalBoardApp`'s board+columns seed effect
  (board/src/App.tsx) — these are separate from `useDefaultRecord` and are
  the exact resurrect-on-empty behavior this decision bans
- Account-side seeding paths in tasks/notes/board sync setup (including
  notes' post-ready "My Notebook" seeding)
- `defaultData.isPristine`, `seed`, `seedRecord`, and `seedChildren` — the
  recognition and re-seeding halves have no post-change role; sample trees
  adopt as units, so structural re-seeding is obsolete. What remains of
  `default-data.ts` is a creation-template helper (multi-record sample
  construction with minted, threaded ids)

Kept (unchanged semantics):
- Adoption/retirement plumbing, blob transfer, StrictMode-safe disposal,
  retirement-only-after-merge invariant

Per app (this pass):
- **tasks**: "My Tasks" becomes a Pattern B sample (onboarding prompt). The
  Inbox fixture ships with the Pattern A remodel (follow-up). No schema
  change in this pass.
- **board**: sample board + columns via Pattern B prompt; empty state
  otherwise.
- **notes**: no notebook fixture; empty state or Pattern B sample prompt.
- **chat**: unchanged (already gates on sign-in — the gate precedent within
  our own examples).
- **photos / passwords**: no scaffolding; unchanged.

Shared gains:
- Onboarding components ("Start fresh / Sign in", optional sample prompt),
  per-app localStorage first-run flag
- Merge/Discard prompt (Pattern C)
- This document + a best-practice guide: fixture-as-view schema pattern,
  creation-once policy, ask-on-merge, and the reasoning (failure modes we
  accept and why)

## E2e rework

Every assertion that encodes the old semantics changes (specs exist because
these bug classes escaped before):

- `tasks.spec.ts` / `board.spec.ts`: "anonymous default visible before
  login" and "exactly one default after account seeds its own" assertions
  are replaced by: onboarding prompt flow (accept sample → sample visible;
  decline → empty state), sign-in path never seeds, user-created data
  survives connect + returning device, sample adopts as user data (visible
  post-connect with the same id), deletion of sample sticks on returning
  device.
- `notes.spec.ts`: notebook-seeding assertions replaced by prompt-flow or
  empty-state assertions per the notes decision above.
- `fixtures.ts`: onboarding-prompt interaction helpers (gate + sample
  accept/decline), Pattern C merge/discard helpers for second-connect
  scenarios.
- New tripwire for the decision's core promise: an emptied account (delete
  everything) + fresh device **never** re-materializes scaffolding.

## Consequences

Accepted imperfections:
- An untouched chosen sample syncs to every device (it is user data).
- A user with two divergent pre-sync local lineages can see duplicate sample
  data after merging. Visible, deletable, chosen (Merge) or rare (double
  start-fresh).
- Fixture rename is fixed-label in v1 (a preferences record can come later).
- tasks' undeletable Inbox waits for the Pattern A remodel.

Guarantees kept:
- Every record id is a random UUID, globally unique — the server's global PK
  is honest by construction, `moveToSpace`'s re-identification contract
  stands, and cross-space id collisions (protocol violations) are traced as
  such rather than masquerading as conflicts.
- Deletion of user data (including sample data) propagates by ordinary sync
  semantics; nothing resurrects because nothing infers "should exist."
- The platform promises nothing about scaffold data it cannot keep.

## Rollout

**Phase 1 (shipped): removal only.** All seed machinery is deleted and every
app starts empty — no onboarding gate, no sample prompts, no fixture views
yet. Apps render their existing empty states; users create data through the
UI. Under the greenfield rule, the adoption-time non-UUID guard was dropped
with it: a record id the server cannot store is rejected permanently and
shows up in the client's quarantine (SDK push isolation), rather than
warranting compat code for a scheme that no longer exists.

**Phase 2 (follow-up): the UX layer.** Onboarding gate ("start fresh / sign
in") with Pattern B sample prompts; Pattern C Merge/Discard prompt for
local-data-meets-account-data; static "add sample" affordance for emptied
accounts; tasks Pattern A fixture remodel (separate todos collection with
`projectId: null` Inbox, client migration) as the reference implementation.

## Deployment note

The sync server (migration 016 + hardening) must deploy before (or with) any
examples release that removes deterministic ids. Prod sees 015+016 as a
no-op round trip; there is no prod data migration for record ids. Dev
stacks that ran v5 examples during the investigation must follow the
runbook above before pulling 016.
