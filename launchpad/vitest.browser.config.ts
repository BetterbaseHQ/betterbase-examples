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
      "@": resolve(__dirname, "src"),
      // App code and the test harness must share one module instance of
      // shared (auth context) — resolve both specifiers to real paths so the
      // link: symlink can't create a duplicate module id
      "@betterbase/examples-shared/test": resolve(__dirname, "../shared/src/test/index.ts"),
      "@betterbase/examples-shared": resolve(__dirname, "../shared/src"),
      // Component tests stub the sync boundary (SDK testing double). Aliased
      // to the SDK's public testing double subpath — a specifier (not a raw
      // path) keeps app configs independent of SDK file layout while still
      // sharing one module instance with `betterbase/testing` imports.
      "betterbase/sync/react": "betterbase/testing/mock-sync",
    },
  },
  server: {
    fs: {
      // Allow access to the linked shared and SDK packages
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
