import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { lessTheme, AuthProvider } from "@betterbase/examples-shared";
import App from "./App.tsx";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={lessTheme}>
      <Notifications />
      <AuthProvider
        domain={import.meta.env.VITE_DOMAIN || "localhost:5377"}
        clientId={import.meta.env.VITE_OAUTH_CLIENT_ID || ""}
        scope="openid email"
      >
        <App />
      </AuthProvider>
    </MantineProvider>
  </StrictMode>,
);
