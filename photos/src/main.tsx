import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { DatabaseProvider } from "betterbase/db/react";
import { lessTheme, AuthProvider } from "@betterbase/examples-shared";
import { db } from "@/lib/db";
import App from "./App.tsx";

import "@mantine/core/styles.css";
import "@mantine/dropzone/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={lessTheme}>
      <AuthProvider
        domain={import.meta.env.VITE_DOMAIN || "localhost:5377"}
        clientId={import.meta.env.VITE_OAUTH_CLIENT_ID || ""}
        scope="openid email sync files"
      >
        <DatabaseProvider value={db}>
          <App />
        </DatabaseProvider>
      </AuthProvider>
    </MantineProvider>
  </StrictMode>,
);
