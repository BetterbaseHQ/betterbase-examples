/**
 * Test harness for the Betterbase example apps.
 *
 * - `renderWithProviders` — Mantine + notifications + mock auth around the ui
 * - `MockAuthProvider` / `makeFakeSession` — drive the local/authenticated paths
 * - `syncReactMocks` — vi.mock replacement for `betterbase/sync/react` that
 *   stubs only the sync boundary while the real local db keeps running
 *
 * Apps consume this via the `@betterbase/examples-shared/test` subpath
 * (TypeScript source — resolved and transformed by Vitest, never built).
 */
export * from "./mock-auth.js";
export * from "./mock-sync.js";
export * from "./render.js";
