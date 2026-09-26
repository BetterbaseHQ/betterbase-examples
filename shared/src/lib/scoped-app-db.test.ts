/**
 * createScopedAppDb — the scope-switch state machine, against real
 * databases. The adoption seam is mocked so the interleavings that matter
 * (a scope committing while a slower open is mid-adoption) can be produced
 * deterministically instead of by timing luck.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { collection, t } from "betterbase/db";
import { accountDbName } from "./account-db.js";
import { createScopedAppDb } from "./scoped-app-db.js";

const adoption = vi.hoisted(() => ({
  /** Hold the first adoption open until `release` is called. */
  holdFirst: false,
  calls: 0,
  release: null as null | (() => void),
}));

vi.mock("./adopt-local-data.js", () => ({
  adoptLocalData: vi.fn(async () => {
    adoption.calls += 1;
    if (adoption.holdFirst && adoption.calls === 1) {
      await new Promise<void>((resolve) => {
        adoption.release = resolve;
      });
    }
    return { merged: 0 };
  }),
}));

const raceItems = collection("race_items").v(1, { name: t.string() }).build();

const createWorker = () =>
  new Worker(new URL("./scoped-db-worker.ts", import.meta.url), { type: "module" });

// Databases are intentionally NOT deleted at test end: deleteDatabase
// spawns a second worker, which contends with the factory's still-open
// worker over the OPFS directory and deadlocks. Unique app names per run
// keep repeated runs independent.

beforeEach(() => {
  adoption.holdFirst = false;
  adoption.calls = 0;
  adoption.release = null;
});

describe("createScopedAppDb", () => {
  it("re-opening the current scope is a no-op returning the same database", async () => {
    const appName = `race-app-${crypto.randomUUID().slice(0, 8)}`;
    const appDb = await createScopedAppDb({ appName, collections: [raceItems], createWorker });
    const before = appDb.db;

    const returned = await appDb.openForScope(null);

    expect(returned).toBe(before);
    expect(appDb.currentScopeDbName()).toBeNull();
  });

  it("a slow adoption must not regress a scope that committed meanwhile", async () => {
    const appName = `race-app-${crypto.randomUUID().slice(0, 8)}`;
    const appDb = await createScopedAppDb({ appName, collections: [raceItems], createWorker });
    const aName = await accountDbName(appName, "scope-a");
    const bName = await accountDbName(appName, "scope-b");
    adoption.holdFirst = true;

    // A opens first and parks inside adoption; B opens, adopts, and commits
    // while A is still merging. A completing afterwards must not assign its
    // (now stale) database underneath B.
    const pA = appDb.openForScope("scope-a");
    await vi.waitFor(() => expect(adoption.calls).toBe(1));
    const pB = appDb.openForScope("scope-b");
    await pB;

    adoption.release!();
    const settledA = await pA;

    expect(appDb.currentScopeDbName()).toBe(bName);
    expect(appDb.currentScopeDbName()).not.toBe(aName);
    // A superseded call settles on whatever is current — assigning its
    // result to the app's live `db` binding stays correct.
    expect(settledA).toBe(appDb.db);
  });
});
