import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Fresh IndexedDB per test file — app databases use fixed names, and without
// this a board created in one file would leak into the next. Runs before the
// test file (and therefore the app's db module) is imported.
const dbs = await indexedDB.databases();
await Promise.all(dbs.map((d) => (d.name ? indexedDB.deleteDatabase(d.name) : undefined)));

afterEach(() => {
  cleanup();
});
