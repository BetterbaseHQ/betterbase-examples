# Photos

Betterbase example app: an end-to-end encrypted photo gallery. Photos are stored
plaintext in the local database for fast querying; `FileStore` syncs the image
blobs to the server as per-space encrypted payloads — the server never sees a
pixel.

- Grid thumbnails are generated client-side at upload time (OffscreenCanvas) so
  the gallery never decodes full-resolution images.
- Requires the `files` OAuth scope (see `src/main.tsx`) — FileStore derives its
  encryption key from the extended-PKCE session.
- Sharing an album creates a shared space, moves the album, migrates its photos
  with an `albumId` FK rewrite (`shareTree`), and invites the peer.
- Known limitation: deleting a photo removes the record and the local cache, but
  the SDK has no remote blob delete yet — orphaned encrypted blobs remain on the
  server and still count against storage.

## Run

`just dev` from the repo root, then open http://localhost:5383 (or `pnpm dev`
here for the app alone; accounts/sync services must be running).

## Two-tab walkthrough

1. Register a user, create an album, and drop in a few photos.
2. In a second tab, register a second user.
3. In tab one, open the album and share it with the second user's handle.
4. Tab two accepts the invitation — the album and its photos appear, decrypted
   with the shared space key. Uploads in either tab sync to the other live.
