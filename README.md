# Betterbase Examples

Everything here works offline, syncs in real time, and encrypts data before it leaves the browser. These apps are built with [betterbase](https://github.com/BetterbaseHQ/betterbase) to show what local-first, end-to-end encrypted development looks like in practice.

> **Start here:** The [tasks](./tasks) app is the simplest full example — auth, sync, sharing, and CRDT merge with minimal app code (the whole app is a few hundred lines; the interesting parts are `lib/` and `App.tsx`). Read it first, then explore the others. Every app has its own README covering what it demonstrates and a two-tab walkthrough.

## Apps

| App | What it shows | URL |
|---|---|---|
| [launchpad](./launchpad) | Auth-only portal (OAuth 2.0 + PKCE, no sync) | [localhost:5380](http://localhost:5380) |
| [tasks](./tasks) | Offline-first todo lists with real-time sync | [localhost:5381](http://localhost:5381) |
| [notes](./notes) | Rich text editing with character-level CRDT merge | [localhost:5382](http://localhost:5382) |
| [photos](./photos) | Encrypted photo gallery with file sync | [localhost:5383](http://localhost:5383) |
| [board](./board) | Collaborative board with live updates | [localhost:5384](http://localhost:5384) |
| [chat](./chat) | Encrypted messaging | [localhost:5385](http://localhost:5385) |
| [passwords](./passwords) | Encrypted password vault | [localhost:5387](http://localhost:5387) |

All apps share common UI components via the [`shared`](./shared) package (`@betterbase/examples-shared`).

## A reading order

Each app is this same app plus one more idea — read them in this order:

1. [launchpad](./launchpad) — OAuth 2.0 + PKCE sign-in only. The auth seam with no data layer.
2. [tasks](./tasks) — the simplest full app: local-first CRUD, adoption, sharing, CRDT merge. **Start here.**
3. [notes](./notes) — rich-text editing: character-level merge of `t.text()` bodies, debounced base-anchored saves.
4. [board](./board) — multi-record trees: parent edges, cascade deletes, children-first sharing, fractional drag ordering.
5. [chat](./chat) — realtime: presence, typing, signed edit chains with spoof detection.
6. [photos](./photos) — blobs: FileStore upload queue, thumbnails, per-account caches, upload-aware sync status.
7. [passwords](./passwords) — per-record sharing and secret hygiene on a flat single collection.

## Hosting all apps (examples image)

`Dockerfile` (repo root; build context is the parent workspace) builds every
app for path-based hosting into a single static-serving container: the
launchpad portal at `/` and each app at `/<app>/`. Deployment-specific
config (accounts domain, OAuth client IDs, enabled apps) is injected at
container start — see [`docker/entrypoint.sh`](./docker/entrypoint.sh) and
`shared/src/lib/runtime-config.ts`. The image is published to GHCR as
`ghcr.io/betterbasehq/betterbase-examples` and deployed by the
[betterbase-deploy](https://github.com/BetterbaseHQ/betterbase-deploy) repo
at `examples.<domain>`. Locally each app still runs standalone on its own
port via `just dev`.

## Quick Start

**Prerequisites:** [Docker](https://www.docker.com/), [just](https://github.com/casey/just), [pnpm](https://pnpm.io/)

1. Clone the dev environment and run setup:
   ```bash
   git clone https://github.com/BetterbaseHQ/betterbase-dev.git
   cd betterbase-dev
   just setup
   ```

2. Start all services:
   ```bash
   just dev
   ```
   You should see health checks pass for `accounts`, `sync`, and `caddy`. OAuth clients for each example app are configured automatically.

3. Open [localhost:5381](http://localhost:5381) (tasks app).

**Try this:** Sign up, create some todos, open a second tab, and watch them sync.

## What the Code Looks Like

Define a collection with a typed schema:

```ts
import { collection, t } from "betterbase/db";

export const lists = collection("lists")
  .v(1, {
    name: t.string(),
    color: t.string(),
    todos: t.array(
      t.object({
        id: t.string(),
        text: t.text(),       // CRDT text — merges character-by-character
        completed: t.boolean(),
      }),
    ),
  })
  .build();
```

Query it reactively in a component:

```ts
import { useQuery } from "betterbase/db/react";

const result = useQuery(lists, { sort: [{ field: "createdAt", direction: "asc" }] });
if (result === undefined) return <Loading />; // first load — gate before reading
```

The `undefined`-until-loaded gate is the one idiom every app needs: the hook
re-fires on every local and synced change, but only the first render has no
data yet. (Inside a synced tree, `betterbase/sync/react`'s `useQuery` adds a
`loaded` flag and `_spaceId` instead.)

The SDK handles offline storage, encryption, sync, and conflict resolution. Your app code just reads and writes data.

## Testing

Every app ships a browser-mode vitest suite that runs against the **real**
local database (OPFS + worker) with the sync boundary stubbed by the SDK's
[`betterbase/testing`](https://github.com/BetterbaseHQ/betterbase) doubles
(see the alias in any `vitest.browser.config.ts`). Run one app's checks:

```bash
pnpm -C tasks check   # prettier + typecheck + build + tests
```

Cross-app flows (sign-up, adoption, returning devices) are covered by the
Playwright suite in the workspace root's `e2e/` (`just e2e` from
`betterbase-dev`).

## Stack

- **React 19** + **TypeScript** + **Vite**
- **Mantine UI 7** for components and layout
- **betterbase** for auth, crypto, sync, and local-first storage
- **pnpm** for package management

## License

[Apache-2.0](LICENSE)
