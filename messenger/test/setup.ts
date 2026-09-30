import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetSyncMocks } from "@betterbase/examples-shared/test";

// Fresh IndexedDB per test file — app databases use fixed names, and without
// this a board created in one file would leak into the next. Load-bearing
// ordering: this runs BEFORE the test file (and therefore before the app db
// module's top-level createDatabase) because setupFiles execute first.
const dbs = await indexedDB.databases();
const wipeAll = Promise.all(
  dbs.map((d) => (d.name ? indexedDB.deleteDatabase(d.name) : undefined)),
);
await Promise.race([
  wipeAll,
  new Promise((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error("IndexedDB wipe stalled — a previous test file's connection may still be open"),
        ),
      5_000,
    ),
  ),
]);

afterEach(() => {
  cleanup();
  resetSyncMocks();
});
