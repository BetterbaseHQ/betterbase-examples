# Launchpad

The examples portal — a card grid linking to the Betterbase example apps. It is the **auth-only** integration: OAuth 2.0 + PKCE sign-in with no sync scope and no database, showing the minimum `AuthProvider` setup.

Runs at [localhost:5380](http://localhost:5380).

## What it demonstrates

- **Auth-only OAuth** — `scope="openid email"` (no `sync`), so no encryption key delivery and no sync wiring
- **Headless `<AuthProvider>`** — the SDK provider handles client construction, callback handling, token refresh, and cross-tab session sync; the app reads `useAuth()`
- **Sign-in copy mode** — `authMode="auth"` on the shared app shell, so the header shows "Sign in" rather than "Connect Sync"

## Setup

`VITE_OAUTH_CLIENT_ID` comes from the root dev environment (`just setup` registers the redirect URI `http://localhost:5380/`). Running this app standalone without that registration will render fine but sign-in will fail.

## Try it

`just dev` from the repo root, then open [localhost:5380](http://localhost:5380). Sign in with a Betterbase account — the same session carries into the other example apps.

See the [examples README](../README.md) for the other apps.
