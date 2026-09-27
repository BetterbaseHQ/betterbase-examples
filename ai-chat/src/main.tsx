import { createRoot } from "react-dom/client";
import { AppRoot } from "@betterbase/examples-shared";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <AppRoot appName="ai-chat" scope="openid">
    <App />
  </AppRoot>,
);
