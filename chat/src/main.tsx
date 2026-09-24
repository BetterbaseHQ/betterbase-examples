import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { appAuthConfig, appStoragePrefix, lessTheme } from "@betterbase/examples-shared";
import { AuthProvider } from "betterbase/auth/react";
import App from "./App.tsx";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

const auth = appAuthConfig("chat");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={lessTheme}>
      <Notifications />
      <AuthProvider
        domain={auth.domain}
        clientId={auth.clientId}
        redirectUri={auth.redirectUri}
        storagePrefix={appStoragePrefix("chat")}
      >
        <App />
      </AuthProvider>
    </MantineProvider>
  </StrictMode>,
);
