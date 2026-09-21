import { useState, useEffect, useCallback, useMemo } from "react";
import { Image } from "lucide-react";
import {
  BetterbaseProvider,
  FileStoreProvider,
  useConnectionStatus,
  useFileUploadQueue,
  useSync,
} from "betterbase/sync/react";
import { FileStore } from "betterbase/sync";
import { useQuery } from "betterbase/db/react";
import {
  LessAppShell,
  useAuth,
  InvitationBanner,
  SyncedAppGate,
  effectiveSyncStatus,
  reportError,
  accountScopeKey,
  useDbScope,
  DbScopeGate,
} from "@betterbase/examples-shared";
import { db, albums, photos, openDatabaseForScope } from "@/lib/db";
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
  } = useAlbums();
  const ops = usePhotoOps(db, fileStore, addPhoto);

  useEffect(() => {
    if (view.kind === "album" && !allAlbums.find((a) => a.id === view.id)) {
      setView({ kind: "all" });
    }
  }, [view, allAlbums]);

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
          onCreate={createAlbum}
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
          selectedAlbum?._spaceId ? (did) => removeMember(selectedAlbum._spaceId!, did) : undefined
        }
      />
    </LessAppShell>
  );
}

// ---------------------------------------------------------------------------
// App — wraps PhotosApp in BetterbaseProvider when authenticated
// ---------------------------------------------------------------------------

export default function App() {
  const { isAuthenticated, session, clientId, logout } = useAuth();
  const { ready: dbReady, key: dbScopeKey } = useDbScope(
    openDatabaseForScope,
    session ? accountScopeKey(session) : null,
  );
  const [fileStore] = useState(() => new FileStore());

  return (
    <DbScopeGate key={dbScopeKey} ready={dbReady}>
      {isAuthenticated && session ? (
        <BetterbaseProvider
          adapter={db}
          collections={[albums, photos]}
          session={session}
          clientId={clientId}
          domain={import.meta.env.VITE_DOMAIN || "localhost:5377"}
          onAuthError={logout}
          fileStore={fileStore}
        >
          <SyncedAppGate>
            <PhotosApp personalSpaceId={session.getPersonalSpaceId()} fileStore={fileStore} />
          </SyncedAppGate>
        </BetterbaseProvider>
      ) : (
        <FileStoreProvider fileStore={fileStore}>
          <LocalPhotosApp fileStore={fileStore} />
        </FileStoreProvider>
      )}
    </DbScopeGate>
  );
}
