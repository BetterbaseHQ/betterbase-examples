# Chat — end-to-end encrypted messaging

Realtime chat over Betterbase's encrypted sync: messages are written plaintext
to the local db and only encrypted when they leave the device — the server
never sees content. Runs on port 5385 (`pnpm dev`).

## Sign-in gated — no offline path

Unlike Tasks, Chat has no local-only mode (`src/App.tsx`): every conversation
is shared, so unauthenticated users get a sign-in gate instead of a degraded
offline experience.

## Conversations are shared from creation

`startConversation()` (`src/lib/sync.ts`) creates the conversation in the
personal space, then hands it to the SDK's `shareTree` — one call that checks
the recipient exists, creates a shared space, moves the conversation into it,
and invites them. A failed share deletes the draft so retries don't accumulate
orphans; the space itself is left behind (the SDK has no space deletion yet).

## Realtime presence and typing

Presence avatars (`usePresence`) and the typing indicator (`useTyping` from
`betterbase/sync/react`) ride the SDK's space-event channel — `useEvent` /
`useSendEvent` over the existing sync WebSocket, no extra connections.

## Signed edit chains

Messages are registered via `editChainCollections` in `BetterbaseProvider`, so
each message carries a signed authorship chain. Peers' messages get a shield
badge when `_editChainValid` is true; own messages omit it because the chain
lags one sync round-trip behind.

## Removal re-keys the conversation

Removing a member (`SpaceManager.removeMember`, surfaced through the members
popover) is a full key rotation: UCANs revoked, the space advanced to a fresh
key with `set_min_epoch` (the server rejects the removed device's stale-epoch
writes immediately), every DEK rewrapped, and the membership log rebuilt under
the new key. The admin sees "Space re-keyed — {handle} no longer has access"
with the new epoch number; the removed member's conversation freezes live —
history and composer replaced by a re-key notice, and messages sent after the
rotation never decrypt on their device (the pre-removal local copy stays until
they delete it — that's the honest local-first guarantee). Pinned end-to-end
by `e2e/tests/chat-removal.spec.ts`, the suite's first genuine two-user spec.

## Try it: two accounts

1. `just dev`, open http://localhost:5385, sign in as alice.
2. In a second browser profile, sign in as bob.
3. Alice starts a conversation with bob — bob accepts the invitation banner
   and both sides chat live.
4. Type in one window: presence avatars and "typing…" react in the other.
5. Alice removes bob via the members popover → her side confirms the re-key
   (epoch bumps); bob's conversation freezes with "You no longer have access".
