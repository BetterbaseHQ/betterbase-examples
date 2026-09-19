# @betterbase/examples-shared

Shared React kit for the Betterbase example apps: theming, the app shell,
and space-sharing UI (members, presence, edit history). Data-layer concerns
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
MantineProvider theme={lessTheme}
└─ Notifications                     (for reportError toasts)
   └─ AuthProvider clientId={import.meta.env.VITE_OAUTH_CLIENT_ID}   (from betterbase/auth/react)
      └─ app root (renders local app or BetterbaseProvider + synced app)
```

## Key exports

| Export                                            | Purpose                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `lessTheme`                                       | Shared Mantine theme                                                                              |
| `AuthProvider` / `useAuth`                        | Re-export of the SDK's headless OAuth context (`login`, `logout`, `session`, `error`, `clientId`) |
| `LessAppShell`                                    | Header + optional navbar + banner slot app shell; `authMode="auth"` for sign-in-only apps         |
| `ItemsSidebar`                                    | Generic sidebar list (nav + inline create + confirm-on-delete with shared warning)                |
| `SyncedAppGate`                                   | Loading gate until the sync context is ready                                                      |
| `reportError`                                     | Toast a failed async op                                                                           |
| `EmptyState`                                      | Standard empty/loading pane                                                                       |
| `ShareButton`, `MembersPanel`, `InvitationBanner` | Space sharing UI                                                                                  |
| `PresenceAvatars`, `TypingIndicator`              | Realtime presence UI (the `useTyping` hook lives in `betterbase/sync/react`)                      |
| `EditHistory`                                     | Signed edit-chain history panel                                                                   |
| `truncateDid`                                     | Compact DID display                                                                               |

Sync status: use `useConnectionStatus()` from `betterbase/sync/react`
(derives `offline > error > syncing > synced`) with the `SyncStatusBadge`
component here.

## Building

```bash
pnpm install
pnpm check   # prettier + tsup build + tsc
```
