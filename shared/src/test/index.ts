/**
 * Test harness for the Betterbase example apps.
 *
 * - `renderWithProviders` — Mantine + notifications + mock auth around the ui
 * - `MockAuthProvider` / `makeFakeSession` — drive the local/authenticated paths
 *   (from the SDK's `betterbase/testing`)
 * - sync-boundary doubles (`setSyncState`, `spaceOp`, `resetSyncMocks`, …) —
 *   re-exported from `betterbase/testing`; install the stub itself via the
 *   `"betterbase/sync/react": "betterbase/testing/mock-sync"` resolve alias
 *   in each app's vitest config
 *
 * Apps consume this via the `@betterbase/examples-shared/test` subpath
 * (TypeScript source — resolved and transformed by Vitest, never built).
 */
export * from "betterbase/testing";
export * from "./render.js";
