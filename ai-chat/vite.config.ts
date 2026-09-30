import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import { sdkSharedWasm } from "@betterbase/examples-shared/vite";
import path from "path";

export default defineConfig({
  // Path-based hosting in the examples container (e.g. /ai-chat/); "/" in dev.
  base: process.env.VITE_BASE_PATH || "/",
  // sdkSharedWasm(): no-op outside image builds (needs SDK_WASM_SHARED_DIR);
  // the examples image dedupes the SDK wasm blobs across apps. See
  // shared/src/vite/shared-wasm.ts.
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
  optimizeDeps: {
    // onnxruntime-web ships its own wasm loader; pre-bundling it breaks the
    // asset paths and the worker's dynamic imports.
    exclude: ["@huggingface/transformers", "onnxruntime-web"],
  },
  server: {
    port: 5386,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
