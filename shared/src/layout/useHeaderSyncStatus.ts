import { useEffect, useState } from "react";
import { useSync } from "betterbase/sync/react";
import type { SyncStatus } from "./SyncStatusBadge.js";

export type { SyncStatus };

/**
 * Derive the header sync status from the sync engine state plus browser
 * connectivity. Must be used inside a `BetterbaseProvider` tree.
 *
 * Centralizes the mapping apps previously each re-implemented:
 * offline > error > syncing (including connect/bootstrap phases) > synced.
 */
export function useHeaderSyncStatus(): SyncStatus {
  const { phase, syncing, error } = useSync();
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  if (!online) return "offline";
  if (error) return "error";
  if (syncing || phase === "connecting" || phase === "bootstrapping") return "syncing";
  return "synced";
}
