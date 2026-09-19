import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    // One React instance across source files and prebundled deps — without
    // this the optimizer splits chunks and contexts come up empty
    dedupe: ["react", "react-dom", "@mantine/core", "@mantine/hooks", "@mantine/notifications"],
    alias: {
      "@betterbase/examples-shared": resolve(__dirname, "src"),
      // Component tests stub the sync boundary (see src/test/mock-sync.tsx)
      "betterbase/sync/react": resolve(__dirname, "src/test/mock-sync.tsx"),
    },
  },
  server: {
    fs: {
      // Allow access to the linked SDK package (two levels up)
      allow: ["../.."],
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    testTimeout: 15_000,
    setupFiles: ["./test/setup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      headless: true,
    },
  },
});
