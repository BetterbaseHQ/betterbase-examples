import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Image } from "lucide-react";
import {
  useConnectionStatus,
  useFileUploadQueue,
  useSync,
  useSpaceStatus,
} from "betterbase/sync/react";
import type { FileStore } from "betterbase/sync";
import { useQuery } from "betterbase/db/react";
import {
  InvitationBanner,
  LessAppShell,
  ScopedAppTree,
  effectiveSyncStatus,
  reportError,
  RemovedSpaceNotice,
  useAuth,
} from "@betterbase/examples-shared";
import {
  db,
  albums,
  photos,
  openDatabaseForScope,
  currentScopeDbName,
  deleteAnonymousDatabase,
  DB_NAME,
} from "@/lib/db";
import { useAlbums } from "@/lib/sync";
import { usePhotoOps, computePhotoCounts } from "@/lib/photo-ops";
import { AlbumSidebar } from "@/components/AlbumSidebar";
import { PhotoGallery } from "@/components/PhotoGallery";

// ---------------------------------------------------------------------------
// View types for sidebar navigation
// ---------------------------------------------------------------------------

export type View = { kind: "all" } | { kind: "album"; id: string };

// ---------------------------------------------------------------------------
// LocalPhotosApp — offline-first, no sharing (unauthenticated path)
// ---------------------------------------------------------------------------

function LocalPhotosApp({ fileStore }: { fileStore: FileStore }) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const [view, setView] = useState<View>({ kind: "all" });
  const ops = usePhotoOps(db, fileStore);

  const albumResult = useQuery(albums, {
    sort: [
      { field: "sortOrder", direction: "asc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allAlbums = albumResult?.records ?? [];

  const photoResult = useQuery(photos, {
    sort: [
      { field: "createdAt", direction: "desc" },
      { field: "id", direction: "asc" },
    ],
  });
  const allPhotos = photoResult?.records ?? [];

  const filteredPhotos =
    view.kind === "album" ? allPhotos.filter((p) => p.albumId === view.id) : allPhotos;

  useEffect(() => {
    if (view.kind === "album" && !allAlbums.find((a) => a.id === view.id)) {
      setView({ kind: "all" });
    }
  }, [view, allAlbums]);

  const createAlbum = useCallback(
    (name: string) => {
      const maxOrder = allAlbums.reduce((max, a) => Math.max(max, a.sortOrder), 0);
      db.put(albums, { name, sortOrder: maxOrder + 1 }).catch((err) =>
        reportError(err, "Couldn't create album"),
      );
    },
    [allAlbums],
  );

  const deleteAlbum = useCallback(
    (id: string) => {
      ops.deleteAlbum(
        id,
        allPhotos.filter((p) => p.albumId === id),
        () => {
          if (view.kind === "album" && view.id === id) setView({ kind: "all" });
        },
      );
    },
    [ops, allPhotos, view],
  );

  const handleUpload = useCallback(
    (files: File[]) => ops.upload(files, view.kind === "album" ? view.id : ""),
    [ops, view],
  );

  const photoCounts = useMemo(
    () => computePhotoCounts(allAlbums, allPhotos),
    [allAlbums, allPhotos],
  );

  return (
    <LessAppShell
      appName="Photos"
      appIcon={<Image size={22} color="var(--mantine-color-indigo-6)" />}
      navbar={
        <AlbumSidebar
          albums={allAlbums}
          view={view}
          onViewChange={setView}
          onCreate={createAlbum}
          onDelete={deleteAlbum}
          counts={photoCounts}
        />
      }
      navbarWidth={240}
      isAuthenticated={isAuthenticated}
      handle={handle}
      onLogin={login}
      onLogout={logout}
    >
      <PhotoGallery photos={filteredPhotos} onUpload={handleUpload} onDelete={ops.deletePhoto} />
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// PhotosApp — synced + sharing (authenticated path, inside BetterbaseProvider)
// ---------------------------------------------------------------------------

// Module-level so it can be passed as a stable hook into the gallery's probe
// seam (called unconditionally every render — rules-of-hooks safe).
function useRemovedAlbumSpace(spaceId: string | null) {
  const { status, name, ready } = useSpaceStatus(spaceId ?? undefined);
  return { removed: status === "removed", name, spaceReady: ready };
}

function PhotosApp({
  personalSpaceId,
  fileStore,
}: {
  personalSpaceId: string | null;
  fileStore: FileStore;
}) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const { error: syncError } = useSync();
  const connectionStatus = useConnectionStatus();
  const uploadQueue = useFileUploadQueue();
  // Record-sync "Synced" must not read as "everything is on the server"
  // while file bytes are still queued (AUD-052).
  const syncStatus = effectiveSyncStatus(connectionStatus, uploadQueue.pending);
  const [view, setView] = useState<View>({ kind: "all" });
  const [deletingLocalCopy, setDeletingLocalCopy] = useState(false);

  const {
    albums: allAlbums,
    photos: allPhotos,
    invitations,
    createAlbum,
    shareAlbum,
    inviteToAlbum,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
    addPhoto,
  } = useAlbums(fileStore);
  const ops = usePhotoOps(db, fileStore, addPhoto);

  // Latest-known space per album id — revocation handling can transiently
  // drop records from query results while the removal propagates, so the
  // view-reset effect below can't rely on the record being present to
  // learn where it lived. Safe to write during render only because a
  // record's _spaceId never changes (moves assign fresh ids), and entries
  // are never deleted — the freeze depends on stale ones.
  const albumSpacesRef = useRef(new Map<string, string | undefined>());
  for (const a of allAlbums) albumSpacesRef.current.set(a.id, a._spaceId);

  const viewAlbumSpaceId =
    view.kind === "album" ? (albumSpacesRef.current.get(view.id) ?? null) : null;
  // Unconditional hook call (rules-of-hooks): null when no album is viewed.
  const removedViewSpace = useRemovedAlbumSpace(viewAlbumSpaceId);
  // Every authenticated record carries _spaceId (personal ones included) —
  // only SHARED albums have a __spaces membership record to wait on.
  const viewIsShared = viewAlbumSpaceId !== null && viewAlbumSpaceId !== personalSpaceId;

  useEffect(() => {
    if (view.kind !== "album") return;
    if (allAlbums.find((a) => a.id === view.id)) return;
    // The album dropped out of the query result. That is either transient
    // churn (revocation propagation re-emits queries mid-flight), a real
    // deletion, or the prelude to the removed-space freeze. Consult the
    // record itself, and never bounce the view while the space's removal
    // status is still unresolved — the victim must land on the freeze
    // notice, not "All Photos".
    let cancelled = false;
    db.get(albums, view.id)
      .then((record) => {
        if (cancelled || record) return; // still exists — query churn
        if (viewIsShared) {
          // Shared album: wait for a definitive space record before
          // resetting; a removed space keeps its view frozen instead.
          if (!removedViewSpace.spaceReady || removedViewSpace.removed) return;
        }
        setView({ kind: "all" });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [view, allAlbums, db, viewIsShared, removedViewSpace.spaceReady, removedViewSpace.removed]);

  const filteredPhotos =
    view.kind === "album" ? allPhotos.filter((p) => p.albumId === view.id) : allPhotos;

  const deleteAlbum = useCallback(
    (id: string) => {
      ops.deleteAlbum(
        id,
        allPhotos.filter((p) => p.albumId === id),
        () => {
          if (view.kind === "album" && view.id === id) setView({ kind: "all" });
        },
      );
    },
    [ops, allPhotos, view],
  );

  const handleUpload = useCallback(
    (files: File[]) => {
      const albumId = view.kind === "album" ? view.id : "";
      const album = albumId ? allAlbums.find((a) => a.id === albumId) : undefined;
      return ops.upload(files, albumId, album);
    },
    [ops, view, allAlbums],
  );

  const photoCounts = useMemo(
    () => computePhotoCounts(allAlbums, allPhotos),
    [allAlbums, allPhotos],
  );

  // Get the currently selected album (for sharing controls in gallery header)
  const selectedAlbum =
    view.kind === "album" ? (allAlbums.find((a) => a.id === view.id) ?? null) : null;

  const banner =
    invitations.length > 0 ? (
      <InvitationBanner
        invitations={invitations}
        onAccept={acceptInvitation}
        onDecline={declineInvitation}
      />
    ) : undefined;

  return (
    <LessAppShell
      appName="Photos"
      appIcon={<Image size={22} color="var(--mantine-color-indigo-6)" />}
      banner={banner}
      navbar={
        <AlbumSidebar
          albums={allAlbums}
          personalSpaceId={personalSpaceId}
          view={view}
          onViewChange={setView}
          onCreate={(name) => {
            createAlbum(name).catch((err) => reportError(err, "Couldn't create album"));
          }}
          onDelete={deleteAlbum}
          counts={photoCounts}
        />
      }
      navbarWidth={240}
      isAuthenticated={isAuthenticated}
      handle={handle}
      syncStatus={syncStatus}
      uploadQueue={{
        pending: uploadQueue.pending,
        errored: uploadQueue.errored,
        onRetry: () => void uploadQueue.retry(),
      }}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      {view.kind === "album" && removedViewSpace.removed ? (
        // The freeze is driven by the view's remembered space, not the
        // album record — revocation handling can transiently (or, until
        // delete-local-copy, permanently) drop records from query results,
        // and the victim must still land on the notice, not the gallery.
        <RemovedSpaceNotice
          kindLabel="album"
          name={removedViewSpace.name}
          deleting={deletingLocalCopy}
          onDeleteLocalCopy={() => {
            setDeletingLocalCopy(true);
            Promise.resolve(deleteAlbum(view.id))
              .catch((err) => reportError(err, "Couldn't delete local copy"))
              .finally(() => setDeletingLocalCopy(false));
          }}
        />
      ) : (
        <PhotoGallery
          photos={filteredPhotos}
          onUpload={handleUpload}
          onDelete={ops.deletePhoto}
          album={selectedAlbum}
          personalSpaceId={personalSpaceId}
          isAdmin={selectedAlbum?._spaceId != null && isAdmin(selectedAlbum._spaceId)}
          onShare={
            selectedAlbum
              ? async (handle) => {
                  const newAlbum = await shareAlbum(selectedAlbum, handle);
                  setView({ kind: "album", id: newAlbum.id });
                }
              : undefined
          }
          onInvite={selectedAlbum ? (handle) => inviteToAlbum(selectedAlbum, handle) : undefined}
          onRemoveMember={
            selectedAlbum?._spaceId
              ? (did) => removeMember(selectedAlbum._spaceId!, did)
              : undefined
          }
        />
      )}
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// App — wraps PhotosApp in BetterbaseProvider when authenticated
// ---------------------------------------------------------------------------

const createFilesWorker = () =>
  new Worker(new URL("./lib/files-worker.ts", import.meta.url), {
    type: "module",
  });

export default function App() {
  return (
    <ScopedAppTree
      appName={DB_NAME}
      collections={[albums, photos]}
      openDatabaseForScope={openDatabaseForScope}
      deleteAnonymousDatabase={deleteAnonymousDatabase}
      getDb={() => db}
      createFilesWorker={createFilesWorker}
      getCurrentScopeDbName={currentScopeDbName}
      local={(fileStore) => <LocalPhotosApp fileStore={fileStore} />}
    >
      {(session, fileStore) => (
        <PhotosApp personalSpaceId={session.getPersonalSpaceId()} fileStore={fileStore} />
      )}
    </ScopedAppTree>
  );
}
