import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { AuthProvider } from "betterbase/auth/react";
import { appAuthConfig, appStoragePrefix, lessTheme } from "@betterbase/examples-shared";
import App from "./App.tsx";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

const auth = appAuthConfig("tasks");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={lessTheme}>
      <Notifications />
      <AuthProvider
        domain={auth.domain}
        clientId={auth.clientId}
        redirectUri={auth.redirectUri}
        storagePrefix={appStoragePrefix("tasks")}
      >
        <App />
      </AuthProvider>
    </MantineProvider>
  </StrictMode>,
);
