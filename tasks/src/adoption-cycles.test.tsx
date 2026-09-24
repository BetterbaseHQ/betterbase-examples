/**
 * Seed-aware adoption — the anonymous→account "common loop" cycles.
 *
 * 1. Power user: anonymous data only, merges into the account (covered
 *    by the merge tests + live verification).
 * 2. Poisoned first visit: an anonymous workspace holding ONLY pristine
 *    default/sample data must adopt NOTHING — the defaults are declared
 *    data, not user data, and merging them would sync junk to every
 *    device.
 * 3. Mix: pristine defaults alongside real anonymous data — the real
 *    data adopts, the seeds do not.
 *
 * The anonymous state is built with `defaultData.seed` directly: these
 * tests pin ADOPTION semantics (marker state, account contents), while
 * the UI seeding paths are covered by the app tests.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import App from "./App";
import { db, lists, openDatabaseForScope } from "@/lib/db";
import { defaultData } from "@/lib/defaults";
import {
  renderWithProviders,
  makeFakeSession,
  setSyncDb,
  wipeCollections,
} from "@betterbase/examples-shared/test";
import { adoptionMarkerKey, accountScopeKey } from "@betterbase/examples-shared";

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  await wipeCollections(db, [lists]);
});

describe("Tasks adoption cycles (declared defaults)", () => {
  it("case 2: a pristine-defaults-only visit adopts nothing and writes no marker", async () => {
    await openDatabaseForScope(null);
    await defaultData.seed(db, [lists]); // exactly what a first visit seeds
    setSyncDb(db);
    const session = makeFakeSession();
    const marker = await adoptionMarkerKey(
      "tasks",
      accountScopeKey(session as unknown as Parameters<typeof accountScopeKey>[0]),
    );

    const synced = renderWithProviders(<App />, {
      db,
      auth: { isAuthenticated: true, session, handle: "alice" },
    });
    await waitFor(() => expect(screen.getAllByText("Lists").length).toBeGreaterThan(0), {
      timeout: 8000,
    });

    // Adoption merged nothing → no marker: the anonymous db is the
    // logged-out workspace and stays armed for later real data. (The
    // account's own default seeding is real-sync machinery, exercised by
    // e2e — the mock sync here would alias the anonymous db.)
    expect(localStorage.getItem(marker)).toBeNull();
    synced.unmount();
  });

  it("case 3: real anonymous data adopts while pristine seeds do not", async () => {
    await openDatabaseForScope(null);
    await defaultData.seed(db, [lists]); // pristine default...
    await db.put(lists, { name: "Anonymous Real Work", color: "green", todos: [] }); // ...plus real work
    setSyncDb(db);
    const session = makeFakeSession();
    const marker = await adoptionMarkerKey(
      "tasks",
      accountScopeKey(session as unknown as Parameters<typeof accountScopeKey>[0]),
    );

    const synced = renderWithProviders(<App />, {
      db,
      auth: { isAuthenticated: true, session, handle: "alice" },
    });
    await waitFor(
      () => expect(screen.getAllByText("Anonymous Real Work").length).toBeGreaterThan(0),
      { timeout: 8000 },
    );

    // Real data merged → marker armed for retirement, and the record
    // lives in the account database. The default list appears exactly
    // once: the pristine anonymous seed did not adopt (deterministic id
    // — the account's own post-sync seed owns that id).
    expect(localStorage.getItem(marker)).toBe("adopted");
    const accountLists = (await db.getAll(lists)).map((r) => r.name);
    expect(accountLists).toContain("Anonymous Real Work");
    expect(accountLists.filter((n) => n === "My Tasks")).toHaveLength(1);
    synced.unmount();
  });
});
