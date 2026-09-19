# @betterbase/examples-shared

Shared React kit for the Betterbase example apps: theming, auth wiring, app
shell, and space-sharing UI (members, presence, typing, edit history).

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
   └─ AuthProvider clientId={import.meta.env.VITE_OAUTH_CLIENT_ID}
      └─ app root (renders local app or BetterbaseProvider + synced app)
```

## Key exports

| Export                                            | Purpose                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `lessTheme`                                       | Shared Mantine theme                                                                                      |
| `AuthProvider` / `useAuth`                        | OAuth session context (`login`, `logout`, `session`, `error`, `clientId`)                                 |
| `LessAppShell`                                    | Header + optional navbar + banner slot app shell                                                          |
| `useHeaderSyncStatus`                             | `(offline > error > syncing > synced)` badge state from the sync engine — use inside `BetterbaseProvider` |
| `reportError`                                     | Toast a failed async op                                                                                   |
| `EmptyState`                                      | Standard empty/loading pane                                                                               |
| `ShareButton`, `MembersPanel`, `InvitationBanner` | Space sharing UI                                                                                          |
| `PresenceAvatars`, `TypingIndicator`, `useTyping` | Realtime presence/typing                                                                                  |
| `EditHistory`                                     | Signed edit-chain history panel                                                                           |
| `truncateDid`                                     | Compact DID display                                                                                       |

## Building

```bash
pnpm install
pnpm check   # prettier + tsup build + tsc
```
