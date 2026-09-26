import { createRoot } from "react-dom/client";
import { AppRoot } from "@betterbase/examples-shared";
import App from "./App.tsx";

import "@mantine/dropzone/styles.css";

createRoot(document.getElementById("root")!).render(
  <AppRoot appName="photos" scope="openid sync files">
    <App />
  </AppRoot>,
);
