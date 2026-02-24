import { useState, useEffect, useCallback } from "react";
import { Image } from "lucide-react";
import {
  BetterbaseProvider,
  FileStoreProvider,
  useSync,
  useSyncReady,
} from "betterbase/sync/react";
import { FileStore, type SpaceFields } from "betterbase/sync";
import { useQuery, useSyncStatus } from "betterbase/db/react";
import {
  LessAppShell,
  useAuth,
  InvitationBanner,
  type SyncStatus,
} from "@betterbase/examples-shared";
import { db, albums, photos } from "@/lib/db";
import type { Photo } from "@/lib/db";
import { useAlbums } from "@/lib/sync";
import { AlbumSidebar } from "@/components/AlbumSidebar";
import { PhotoGallery } from "@/components/PhotoGallery";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read image dimensions by loading into an Image element. */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// View types for sidebar navigation
// ---------------------------------------------------------------------------

export type View = { kind: "all" } | { kind: "album"; id: string };

// ---------------------------------------------------------------------------
// LocalPhotosApp — offline-first, no sharing (unauthenticated path)
// ---------------------------------------------------------------------------

function LocalPhotosApp({ fileStore }: { fileStore: FileStore }) {
  const { isAuthenticated, handle, login, logout } = useAuth();
  const { syncing, error: syncError } = useSyncStatus();
  const [view, setView] = useState<View>({ kind: "all" });

  const albumResult = useQuery(albums, {
    sort: [{ field: "sortOrder", direction: "asc" }],
  });
  const allAlbums = albumResult?.records ?? [];

  const photoResult = useQuery(photos, {
    sort: [{ field: "createdAt", direction: "desc" }],
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
      db.put(albums, { name, sortOrder: maxOrder + 1 });
    },
    [allAlbums],
  );

  const deleteAlbum = useCallback(
    async (id: string) => {
      const toDelete = allPhotos.filter((p) => p.albumId === id);
      await Promise.all(toDelete.map((p) => db.delete(photos, p.id)));
      await db.delete(albums, id);
      fileStore.evictAll(toDelete.map((p) => p.fileId));
      if (view.kind === "album" && view.id === id) setView({ kind: "all" });
    },
    [allPhotos, view, fileStore],
  );

  const handleUpload = useCallback(
    async (files: File[]) => {
      const albumId = view.kind === "album" ? view.id : "";
      for (const file of files) {
        const fileId = crypto.randomUUID();
        const data = new Uint8Array(await file.arrayBuffer());
        const { width, height } = await getImageDimensions(file);
        const record = await db.put(photos, {
          albumId,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          width,
          height,
          fileId,
          caption: "",
        });
        await fileStore.put(fileId, data, record.id);
      }
    },
    [view, fileStore],
  );

  const deletePhoto = useCallback(
    async (photo: Photo) => {
      await db.delete(photos, photo.id);
      fileStore.evict(photo.fileId);
    },
    [fileStore],
  );

  const photoCounts = {
    all: allPhotos.length,
    byAlbum: Object.fromEntries(
      allAlbums.map((a) => [a.id, allPhotos.filter((p) => p.albumId === a.id).length]),
    ),
  };

  const headerSyncStatus: SyncStatus | undefined = isAuthenticated
    ? syncError
      ? "error"
      : syncing
        ? "syncing"
        : "synced"
    : undefined;

  return (
    <LessAppShell
      appName="Less Photos"
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
      syncStatus={headerSyncStatus}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      <PhotoGallery photos={filteredPhotos} onUpload={handleUpload} onDelete={deletePhoto} />
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
  const { syncing, error: syncError } = useSync();
  const [view, setView] = useState<View>({ kind: "all" });

  const {
    albums: allAlbums,
    photos: allPhotos,
    invitations,
    createAlbum,
    deleteAlbum: hookDeleteAlbum,
    shareAlbum,
    inviteToAlbum,
    acceptInvitation,
    declineInvitation,
    removeMember,
    isAdmin,
    addPhoto: hookAddPhoto,
    deletePhoto: hookDeletePhoto,
  } = useAlbums();

  useEffect(() => {
    if (view.kind === "album" && !allAlbums.find((a) => a.id === view.id)) {
      setView({ kind: "all" });
    }
  }, [view, allAlbums]);

  const filteredPhotos =
    view.kind === "album" ? allPhotos.filter((p) => p.albumId === view.id) : allPhotos;

  const deleteAlbum = useCallback(
    async (id: string) => {
      const deletedPhotos = await hookDeleteAlbum(id);
      fileStore.evictAll(deletedPhotos.map((p) => p.fileId));
      if (view.kind === "album" && view.id === id) setView({ kind: "all" });
    },
    [hookDeleteAlbum, view, fileStore],
  );

  const handleUpload = useCallback(
    async (files: File[]) => {
      const albumId = view.kind === "album" ? view.id : "";
      const album = albumId
        ? (allAlbums.find((a) => a.id === albumId) as
            | ((typeof allAlbums)[number] & SpaceFields)
            | undefined)
        : undefined;

      for (const file of files) {
        const fileId = crypto.randomUUID();
        const data = new Uint8Array(await file.arrayBuffer());
        const { width, height } = await getImageDimensions(file);
        const record = await hookAddPhoto(
          {
            albumId,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            width,
            height,
            fileId,
            caption: "",
          },
          album,
        );
        await fileStore.put(fileId, data, record.id);
      }
    },
    [view, allAlbums, hookAddPhoto, fileStore],
  );

  const deletePhoto = useCallback(
    async (photo: Photo) => {
      await hookDeletePhoto(photo.id);
      fileStore.evict(photo.fileId);
    },
    [hookDeletePhoto, fileStore],
  );

  const photoCounts = {
    all: allPhotos.length,
    byAlbum: Object.fromEntries(
      allAlbums.map((a) => [a.id, allPhotos.filter((p) => p.albumId === a.id).length]),
    ),
  };

  // Get the currently selected album (for sharing controls in gallery header)
  const selectedAlbum =
    view.kind === "album"
      ? ((allAlbums.find((a) => a.id === view.id) as
          | ((typeof allAlbums)[number] & SpaceFields)
          | undefined) ?? null)
      : null;

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
      appName="Less Photos"
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
      syncStatus={syncError ? "error" : syncing ? "syncing" : "synced"}
      syncError={syncError ?? undefined}
      onLogin={login}
      onLogout={logout}
    >
      <PhotoGallery
        photos={filteredPhotos}
        onUpload={handleUpload}
        onDelete={deletePhoto}
        album={selectedAlbum}
        personalSpaceId={personalSpaceId}
        isAdmin={selectedAlbum?._spaceId ? isAdmin(selectedAlbum._spaceId) : false}
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
// SyncGuard — waits for LessContext to be ready before rendering PhotosApp.
// ---------------------------------------------------------------------------

function SyncGuard({
  personalSpaceId,
  fileStore,
}: {
  personalSpaceId: string | null;
  fileStore: FileStore;
}) {
  const ready = useSyncReady();
  if (!ready) return null;
  return <PhotosApp personalSpaceId={personalSpaceId} fileStore={fileStore} />;
}

// ---------------------------------------------------------------------------
// App — wraps PhotosApp in BetterbaseProvider when authenticated
// ---------------------------------------------------------------------------

export default function App() {
  const { isAuthenticated, session, clientId, logout } = useAuth();
  const [fileStore] = useState(() => new FileStore());

  if (isAuthenticated && session) {
    return (
      <BetterbaseProvider
        adapter={db}
        collections={[albums, photos]}
        session={session}
        clientId={clientId}
        domain={import.meta.env.VITE_DOMAIN || "localhost:5377"}
        onAuthError={logout}
        fileStore={fileStore}
      >
        <SyncGuard personalSpaceId={session.getPersonalSpaceId()} fileStore={fileStore} />
      </BetterbaseProvider>
    );
  }

  return (
    <FileStoreProvider fileStore={fileStore}>
      <LocalPhotosApp fileStore={fileStore} />
    </FileStoreProvider>
  );
}
