import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { DatabaseProvider } from "betterbase/db/react";
import { AuthProvider } from "betterbase/auth/react";
import { lessTheme } from "@betterbase/examples-shared";
import { db } from "@/lib/db";
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
      >
        <DatabaseProvider value={db}>
          <App />
        </DatabaseProvider>
      </AuthProvider>
    </MantineProvider>
  </StrictMode>,
);
