// Theme
export { lessTheme } from "./theme.js";

// Auth — re-exported from the SDK (headless provider + hooks)
export { AuthProvider, useAuth } from "betterbase/auth/react";
export type { AuthContextValue, AuthProviderProps } from "betterbase/auth/react";

// Layout
export { LessAppShell } from "./layout/LessAppShell.js";
export { AppRoot } from "./layout/AppRoot.js";
export { HeaderBar, DEFAULT_LAUNCHPAD_URL, resolveLaunchpadUrl } from "./layout/HeaderBar.js";
export { UserArea } from "./layout/UserArea.js";
export { ConnectSyncModal } from "./layout/ConnectSyncModal.js";
export { SyncStatusBadge } from "./layout/SyncStatusBadge.js";
export { UploadQueueStatus, effectiveSyncStatus } from "./layout/UploadQueueStatus.js";
export type { UploadQueueStatusProps } from "./layout/UploadQueueStatus.js";
export { ItemsSidebar } from "./layout/ItemsSidebar.js";
export type { ItemsSidebarItem } from "./layout/ItemsSidebar.js";
export { SyncedAppGate } from "./layout/SyncedAppGate.js";
export type { RetireAnonymousConfig } from "./layout/SyncedAppGate.js";
export { DbScopeGate } from "./layout/DbScopeGate.js";
export { ScopedAppTree } from "./layout/ScopedAppTree.js";
export type { ScopedAppTreeProps } from "./layout/ScopedAppTree.js";

// Components
export { EmptyState } from "./components/EmptyState.js";
export { CreateFirstItem } from "./components/CreateFirstItem.js";
export { ConfirmDialog } from "./components/ConfirmDialog.js";
export { InlineTextInput } from "./components/InlineTextInput.js";

// Utilities
export { reportError } from "./notify.js";

// Sharing
export { InvitationBanner } from "./sharing/InvitationBanner.js";
export { MembersPanel } from "./sharing/MembersPanel.js";
export { ShareButton } from "./sharing/ShareButton.js";
export { PresenceAvatars } from "./sharing/PresenceAvatars.js";
export { TypingIndicator } from "./sharing/TypingIndicator.js";
export { truncateDid } from "./sharing/did.js";
export type { SpaceRecord, SpaceFields, Member, SpaceRole } from "betterbase/sync";

// Hooks
export { useFlushableDebouncedCallback } from "./useFlushableDebouncedCallback.js";

// Account-scoped databases (AUD-045)
export { accountScopeKey, accountDbName, accountScopeHash } from "./lib/account-db.js";
export type { AccountScopeSource } from "./lib/account-db.js";
export { createScopedAppDb } from "./lib/scoped-app-db.js";
export type { ScopedAppDb, ScopedAppDbOptions } from "./lib/scoped-app-db.js";
export { useDbScope } from "./lib/use-account-db.js";
export { adoptLocalData, retireLocalData, adoptionMarkerKey } from "./lib/adopt-local-data.js";
export type { AdoptLocalDataOptions, RetireLocalDataOptions } from "./lib/adopt-local-data.js";

// Runtime configuration (deployed examples container / dev fallbacks)
export {
  appAuthConfig,
  appStoragePrefix,
  runtimeConfig,
  runtimeDomain,
  runtimeClientId,
  runtimeRedirectUri,
} from "./lib/runtime-config.js";
export type { BetterbaseRuntimeConfig } from "./lib/runtime-config.js";
