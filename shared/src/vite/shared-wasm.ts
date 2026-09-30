import type { Plugin } from "vite";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { env, pid } from "node:process";
import path from "node:path";

/**
 * Serves the SDK's WASM blobs from one shared, origin-level URL instead of
 * per-app asset paths.
 *
 * Both blobs (`betterbase_wasm_bg`, `betterbase_db_wasm_bg`) are identical
 * bytes in every app build, and Vite derives their asset hashes from content
 * — so every app emits the same filenames under its own base path. Browsers
 * cache per URL, so each app re-downloaded ~4.6 MB of the same two files.
 *
 * When active, this plugin rewrites every in-chunk reference to
 * `{publicPath}/<name>-<hash>.wasm`, drops the per-app asset from the bundle,
 * and writes the blob once into `sharedDir`. Combined with immutable caching
 * on `{publicPath}/*`, each blob is downloaded once per deploy, ever — not
 * once per app.
 *
 * Safety: an asset is only dropped from the bundle when no unrewritten
 * reference to it remains; otherwise the per-app copy is kept (dedup
 * degrades to a build warning, never a runtime 404).
 *
 * Inactive unless `SDK_WASM_SHARED_DIR` is set: dev servers and local builds
 * keep Vite's default per-app emission.
 */

/** Filenames Vite emits for the two SDK wasm assets (no flags — reused safely). */
const SDK_WASM_SRC = "betterbase(?:_db)?_wasm_bg-[A-Za-z0-9_-]+\\.wasm";

/**
 * Matches an `assets/<sdk wasm filename>` reference at a string-literal
 * boundary (quote, backtick, paren, `=`, or whitespace). Anchoring keeps the
 * rewrite from mangling full URLs whose scheme isn't in the prefix class
 * (e.g. a future CDN base like https://cdn.example.com/assets/…).
 */
const REF_RE = new RegExp(`(["'\`(=\\s])((?:[A-Za-z0-9_.~/-]*/)?assets/(${SDK_WASM_SRC}))`, "g");

function isSdkWasmAsset(fileName: string): boolean {
  return new RegExp(`^assets/${SDK_WASM_SRC}$`).test(fileName);
}

export function sdkSharedWasm(): Plugin {
  const sharedDir = env.SDK_WASM_SHARED_DIR;
  const publicPath = (env.SDK_WASM_PUBLIC_PATH || "/sdk").replace(/\/$/, "");
  let rewritten = 0;
  return {
    name: "betterbase:shared-sdk-wasm",
    apply: "build",
    ...(sharedDir
      ? {
          // Rewrite URL references (plain constants and new URL(...) forms
          // alike) to the shared origin-level path. Works under any base.
          renderChunk(code) {
            const out = code.replace(REF_RE, (_m, boundary, _orig, name) => {
              rewritten++;
              return `${boundary}${publicPath}/${name}`;
            });
            return { code: out, map: null };
          },
          generateBundle(_, bundle) {
            const chunks = Object.values(bundle).flatMap((c) =>
              c.type === "chunk" ? [c.code] : [],
            );
            let found = 0;
            for (const [fileName, chunk] of Object.entries(bundle)) {
              if (chunk.type !== "asset" || !isSdkWasmAsset(fileName)) continue;
              found++;
              const name = path.basename(fileName);
              const unrewritten = new RegExp(
                `assets/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
              );
              if (chunks.some((code) => unrewritten.test(code))) {
                this.warn(
                  `sdkSharedWasm: unrewritten reference to ${fileName}; keeping the per-app asset (dedup skipped).`,
                );
                continue;
              }
              mkdirSync(sharedDir, { recursive: true });
              // Temp file + rename: atomic, and safe if app builds ever run
              // concurrently (both write byte-identical content).
              const target = path.join(sharedDir, name);
              const tmp = path.join(sharedDir, `.${pid}-${name}`);
              writeFileSync(tmp, chunk.source as Uint8Array);
              renameSync(tmp, target);
              // The blob now lives at the shared path — drop the per-app copy.
              delete bundle[fileName];
            }
            if (found === 0 && rewritten > 0) {
              // Refs were rewritten but no asset was found and hoisted —
              // those URLs now point only at the shared dir, so a stale
              // blob there would 404. Multi-environment builds (e.g. an
              // inference worker with no SDK code) stay silent.
              this.warn(
                "sdkSharedWasm: SDK wasm referenced but no matching asset found in this bundle — /sdk refs rely on the shared dir.",
              );
            }
          },
        }
      : {}),
  };
}
