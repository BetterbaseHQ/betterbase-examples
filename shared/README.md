# @betterbase/examples-shared

Shared React kit for the Betterbase example apps: theming, the app shell,
and space-sharing UI (members, presence). Data-layer concerns
(auth context, sync-status derivation, typing protocol, test doubles) live
in the SDK itself — `betterbase/auth/react`, `betterbase/sync/react`, and
`betterbase/testing` — and this kit re-exports or consumes them.

## Setup

The package is consumed via pnpm `link:` from each example app and built with
tsup into `dist/`. Consumers supply every runtime dependency as peers:

```jsonc
// app package.json
"dependencies": {
  "@betterbase/examples-shared": "link:../shared",
  "@mantine/core": "^7.17.0",
  "@mantine/hooks": "^7.17.0",
  "@mantine/notifications": "^7.17.0",
  "betterbase": "link:../../betterbase/js",
  "lucide-react": "^0.469.0",
  "react": "^19.2.4"
}
```

Apps must mount `<Notifications />` from `@mantine/notifications` — the kit's
`reportError()` helper reports failed async operations through it.

## Provider order

```
AppRoot (this kit)           — StrictMode → MantineProvider theme={lessTheme} → Notifications
└─ AuthProvider clientId={…} (from betterbase/auth/react)
   └─ app root (renders local app or ScopedAppTree: BetterbaseProvider + synced app)
```

`AppRoot` wires the first two layers from an app name; apps pass their
OAuth `scope` only when it differs from the SDK default.

## Key exports

| Export                                            | Purpose                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `lessTheme`                                       | Shared Mantine theme                                                                              |
| `AppRoot`                                         | Root every app mounts: StrictMode → Mantine (lessTheme) → Notifications → AuthProvider            |
| `AuthProvider` / `useAuth`                        | Re-export of the SDK's headless OAuth context (`login`, `logout`, `session`, `error`, `clientId`) |
| `LessAppShell`                                    | Header + optional navbar + banner slot app shell; `authMode="auth"` for sign-in-only apps         |
| `ItemsSidebar`                                    | Generic sidebar list (nav + inline create + confirm-on-delete with shared warning)                |
| `SyncedAppGate`                                   | Loading gate until the sync context is ready                                                      |
| `reportError`                                     | Toast a failed async op                                                                           |
| `EmptyState`                                      | Standard empty/loading pane                                                                       |
| `ShareButton`, `MembersPanel`, `InvitationBanner` | Space sharing UI                                                                                  |
| `PresenceAvatars`, `TypingIndicator`              | Realtime presence UI (the `useTyping` hook lives in `betterbase/sync/react`)                      |
| `truncateDid`                                     | Compact DID display                                                                               |
| `createScopedAppDb`                               | The per-app database lifecycle: anonymous namespace, per-account scopes, adoption, retirement     |

## The scope lifecycle (what every app's `lib/db.ts` does)

Each app owns a thin `lib/db.ts` module — it must own `export let db`,
because module live bindings can't be re-exported from a factory — and
delegates the machinery to `createScopedAppDb`:

- The bare app name is the **anonymous** namespace. Data created before
  sign-in lives here; offline-first means it is never thrown away.
- On the first sign-in, anonymous data is **adopted**: merged into the
  account's database before the swap commits, so a failure keeps the
  previous database current and a retry re-runs the merge (idempotent).
- Each signed-in account opens `appName_<scope-hash>` — one account's
  decrypted records are never visible to another account or to the
  unauthenticated view (AUD-045).
- After adoption + a synced-ready phase, the anonymous namespace is
  **retired** (`deleteAnonymousDatabase`) — its records' only home is the
  account database. Apps with blob caches extend retirement via
  `retireAnonymousExtras` (photos deletes the default-name cache).
- The app root remounts (React key) whenever the scope swaps, so no
  component observes a database mid-swap.

Sync status: use `useConnectionStatus()` from `betterbase/sync/react`
(derives `offline > error > syncing > synced`) with the `SyncStatusBadge`
component here.

## Building

```bash
pnpm install
pnpm check   # prettier + tsup build + tsc
```
