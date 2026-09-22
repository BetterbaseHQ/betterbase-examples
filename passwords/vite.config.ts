import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import path from "path";

const accountsUrl = process.env.ACCOUNTS_URL || "http://localhost:5377";
const syncUrl = process.env.SYNC_URL || "http://localhost:5379";

export default defineConfig({
  // Path-based hosting in the samples container (e.g. /tasks/); "/" in dev.
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [wasm(), react()],
  worker: {
    format: "es",
    plugins: () => [wasm()],
  },
  resolve: {
    dedupe: ["react", "react-dom", "@mantine/core", "@mantine/hooks", "lucide-react"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5387,
    strictPort: true,
    proxy: {
      "/oauth": {
        target: accountsUrl,
        changeOrigin: true,
      },
      "/v1/users": {
        target: accountsUrl,
        changeOrigin: true,
      },
      "/health": {
        target: syncUrl,
        changeOrigin: true,
      },
      "/api/v1/ws": {
        target: syncUrl,
        changeOrigin: true,
        ws: true,
      },
      "/api/v1": {
        target: syncUrl,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
