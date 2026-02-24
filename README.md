# Betterbase Examples

Everything here works offline, syncs in real time, and encrypts data before it leaves the browser. These apps are built with [betterbase](https://github.com/BetterbaseHQ/betterbase) to show what local-first, end-to-end encrypted development looks like in practice.

> **Start here:** The [tasks](./tasks) app is the simplest full example — auth, sync, and CRDT merge in under 200 lines of application code. Read it first, then explore the others.

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
```

The SDK handles offline storage, encryption, sync, and conflict resolution. Your app code just reads and writes data.

## Stack

- **React 19** + **TypeScript** + **Vite**
- **Mantine UI 7** for components and layout
- **betterbase** for auth, crypto, sync, and local-first storage
- **pnpm** for package management

## License

[Apache-2.0](LICENSE)
