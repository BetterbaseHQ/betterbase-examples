import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { DatabaseProvider } from "betterbase/db/react";
import { AuthProvider } from "betterbase/auth/react";
import { appAuthConfig, appStoragePrefix, lessTheme } from "@betterbase/examples-shared";
import { db } from "@/lib/db";
import App from "./App.tsx";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/tiptap/styles.css";

const auth = appAuthConfig("notes");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={lessTheme}>
      <Notifications />
      <AuthProvider domain={auth.domain} clientId={auth.clientId} redirectUri={auth.redirectUri} storagePrefix={appStoragePrefix("notes")}>
        <DatabaseProvider value={db}>
          <App />
        </DatabaseProvider>
      </AuthProvider>
    </MantineProvider>
  </StrictMode>,
);
