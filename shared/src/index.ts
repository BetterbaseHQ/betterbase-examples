// Theme
export { lessTheme } from "./theme.js";

// Auth
export { AuthProvider, useAuth } from "./auth.js";
export type { AuthContextValue, AuthProviderProps } from "./auth.js";

// Layout
export { LessAppShell } from "./layout/LessAppShell.js";
export { HeaderBar } from "./layout/HeaderBar.js";
export { EncryptionIndicator } from "./layout/EncryptionIndicator.js";
export { UserArea } from "./layout/UserArea.js";
export { ConnectSyncModal } from "./layout/ConnectSyncModal.js";
export { SyncStatusBadge } from "./layout/SyncStatusBadge.js";
export type { SyncStatus } from "./layout/SyncStatusBadge.js";

// Components
export { EmptyState } from "./components/EmptyState.js";

// Sharing
export { InvitationBanner } from "./sharing/InvitationBanner.js";
export { MembersPanel } from "./sharing/MembersPanel.js";
export { ShareButton } from "./sharing/ShareButton.js";
export { PresenceAvatars } from "./sharing/PresenceAvatars.js";
export { TypingIndicator } from "./sharing/TypingIndicator.js";
export { useTyping } from "./sharing/useTyping.js";
export { EditHistory } from "./sharing/EditHistory.js";
export { peerGradient, peerHue } from "./sharing/peerColor.js";
export type { SpaceRecord, SpaceFields, Member, SpaceRole } from "betterbase/sync";
