import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { LessDBProvider } from "@betterbase/sdk/db/react";
import { lessTheme, AuthProvider } from "@betterbase/examples-shared";
import { db } from "@/lib/db";
import App from "./App.tsx";
import { initWasm } from "@betterbase/sdk";

import "@mantine/core/styles.css";
import "@mantine/dropzone/styles.css";

await initWasm();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={lessTheme}>
      <AuthProvider
        domain={import.meta.env.VITE_DOMAIN || "localhost:5377"}
        clientId={import.meta.env.VITE_OAUTH_CLIENT_ID || ""}
        scope="openid email sync files"
      >
        <LessDBProvider value={db}>
          <App />
        </LessDBProvider>
      </AuthProvider>
    </MantineProvider>
  </StrictMode>,
);
