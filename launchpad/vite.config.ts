import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import path from "path";

const accountsUrl = process.env.ACCOUNTS_URL || "http://localhost:5377";

export default defineConfig({
  plugins: [wasm(), react()],
  worker: {
    format: "es",
    plugins: () => [wasm()],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5380,
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
    },
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
