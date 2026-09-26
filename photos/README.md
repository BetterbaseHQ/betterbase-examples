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

## Removal re-keys the album

Removing a member from a shared album is a full key rotation: UCANs revoked,
the space advanced to a fresh key with `set_min_epoch` (the server rejects
the removed device's stale-epoch writes immediately), every DEK rewrapped,
and the membership log rebuilt under the new key. The admin sees
"Space re-keyed — {handle} no longer has access" with the new epoch number;
the removed member's album freezes — grid, dropzone, and lightbox replaced
by a re-key notice — and photos uploaded after the rotation never decrypt on
their device. Photos has an extra honesty wrinkle: the browser caches image
blobs locally for offline viewing, and a cached pre-removal photo outlives
its record. "Delete local copy" removes the records _and_ evicts every
cached blob the album references (the same `deleteTree` + `evictAll` path a
normal album delete takes).

## Two-tab walkthrough

1. Register a user, create an album, and drop in a few photos.
2. In a second tab, register a second user.
3. In tab one, open the album and share it with the second user's handle.
4. Tab two accepts the invitation — the album, its photo records, _and the
   blobs themselves_ appear, decrypted with the shared space key. Uploads in
   either tab sync to the other live: file operations route to the owning
   space (per-space epoch keys, UCAN auth), and blobs cached before a share
   are migrated into the shared space and re-uploaded under its key. (Blobs
   migrate when cached on the sharing device — photos whose bytes live only
   on another device or were evicted show "Unavailable" until re-uploaded.)
