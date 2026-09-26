import { StrictMode, type ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { AuthProvider } from "betterbase/auth/react";
import { appAuthConfig, appStoragePrefix } from "../lib/runtime-config.js";
import { lessTheme } from "../theme.js";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

/**
 * The root every example app mounts: StrictMode → Mantine (Less theme) →
 * Notifications → AuthProvider wired to this app's OAuth config. Apps pass
 * their extra stylesheets (tiptap, dropzone) from their own `main.tsx` —
 * imported after this module so they layer on top of the base styles.
 */
export function AppRoot({
  appName,
  scope,
  children,
}: {
  appName: string;
  /** OAuth scopes; omit for the SDK default (`"openid sync"`). Photos adds `files`, launchpad uses `openid` only. */
  scope?: string;
  children: ReactNode;
}) {
  const auth = appAuthConfig(appName);
  return (
    <StrictMode>
      <MantineProvider theme={lessTheme}>
        <Notifications />
        <AuthProvider
          domain={auth.domain}
          clientId={auth.clientId}
          redirectUri={auth.redirectUri}
          storagePrefix={appStoragePrefix(appName)}
          scope={scope}
        >
          {children}
        </AuthProvider>
      </MantineProvider>
    </StrictMode>
  );
}
