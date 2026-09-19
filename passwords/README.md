# Passwords

A local-first, end-to-end encrypted password vault. Everything works offline first, then encrypts and syncs. Runs at [localhost:5387](http://localhost:5387).

## What it demonstrates

- **Single collection, per-entry sharing** — one `entries` collection (no parent/child structure); sharing moves a single entry into a shared space via `shareTree` with no children
- **Confidentiality from the transport, not the schema** — fields are plain `t.string()`; secrecy comes entirely from the SDK's encrypted sync (plaintext locally, encrypted blobs on the server)
- **Rejection-sampling generator** — password generation uses rejection sampling for unbiased uniform character selection (modulo of 2^32 would bias tail classes)
- **Clipboard auto-clear** — copied secrets are wiped from the clipboard after a timeout, and non-secret copies cancel any pending clear
- **Reveal masking** — passwords stay masked by default and re-mask on tab hide, after a bounded reveal window, or on entry switch

## Schema

```ts
export const entries = collection("entries")
  .v(1, {
    site: t.string(),
    url: t.string(),
    username: t.string(),
    password: t.string(),
    notes: t.text(),
    category: t.string(),
  })
  .build();
```

## Try it

Run `just dev` from the repo root, then open [localhost:5387](http://localhost:5387). Sign up, generate a password, and save it. Share an entry with a second account — it becomes a shared entry both of you can reveal and copy.

See the [examples README](../README.md) for the other apps and how they fit together.
