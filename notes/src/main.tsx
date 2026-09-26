import { createRoot } from "react-dom/client";
import { AppRoot } from "@betterbase/examples-shared";
import App from "./App.tsx";

import "@mantine/tiptap/styles.css";

createRoot(document.getElementById("root")!).render(
  <AppRoot appName="notes">
    <App />
  </AppRoot>,
);
