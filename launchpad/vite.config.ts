import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import { sdkSharedWasm } from "@betterbase/examples-shared/vite";
import path from "path";

export default defineConfig({
  // Path-based hosting in the examples container (e.g. /tasks/); "/" in dev.
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [wasm(), sdkSharedWasm(), react()],
  worker: {
    format: "es",
    plugins: () => [wasm(), sdkSharedWasm()],
  },
  resolve: {
    dedupe: ["react", "react-dom", "@mantine/core", "@mantine/hooks", "lucide-react"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5380,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
