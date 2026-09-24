import { describe, it, expect, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { db, lists, openDatabaseForScope } from "@/lib/db";
import {
  renderWithProviders,
  makeFakeSession,
  setSyncDb,
  wipeCollections,
  lastProviderProps,
} from "@betterbase/examples-shared/test";
import { createTodoOps, type TodoDb } from "@/lib/todos";
import { accountScopeKey, adoptionMarkerKey } from "@betterbase/examples-shared";

afterEach(async () => {
  await wipeCollections(db, [lists]);
});

// Reset the module to the anonymous database after each test — an
// authenticated test otherwise leaves the account scope open and the
// next local test pays the swap-back database boot inside its assertions.
afterEach(async () => {
  await openDatabaseForScope(null);
});

describe("Tasks app sync wiring", () => {
  it("registers the lists collection with BetterbaseProvider", async () => {
    setSyncDb(db);
    renderWithProviders(<App />, {
      db,
      auth: { isAuthenticated: true, session: makeFakeSession(), handle: "alice" },
    });

    await waitFor(() => expect(screen.getAllByText("My Tasks").length).toBeGreaterThan(0), {
      timeout: 4000,
    });

    const names = lastProviderProps()
      .collections.map((c) => (c as { name: string }).name)
      .sort();
    expect(names).toEqual(["lists"]);
  });

  it("regression: remounting with an existing default list does not create a second one", async () => {
    // A page reload remounts the whole tree: the auto-create one-shot guard
    // resets while the record already exists, and the reactive query starts
    // empty and repopulates asynchronously although phase is "ready"
    // immediately. Deciding emptiness from a direct db read (not the query)
    // is what keeps reloads from duplicating the default list.
    const auth = { isAuthenticated: true, session: makeFakeSession(), handle: "alice" };
    setSyncDb(db);

    const first = renderWithProviders(<App />, { db, auth });
    await waitFor(() => expect(screen.getAllByText("My Tasks").length).toBeGreaterThan(0), {
      timeout: 4000,
    });
    first.unmount();

    renderWithProviders(<App />, { db, auth });
    await waitFor(() => expect(screen.getAllByText("My Tasks").length).toBeGreaterThan(0), {
      timeout: 4000,
    });
    // Let any erroneous duplicate put land before asserting
    await new Promise((r) => setTimeout(r, 150));

    const all = await db.query(lists, {});
    const defaults = all.records.filter((r) => r.name === "My Tasks");
    expect(defaults).toHaveLength(1);
  });
});

describe("Tasks local flow", () => {
  it("adds, completes, and deletes tasks through the real local db", async () => {
    const user = userEvent.setup();
    await openDatabaseForScope(null); // align scope — no swap/boot at mount
    renderWithProviders(<App />, { db }); // unauthenticated → LocalTasksApp

    // Auto-created default list
    await waitFor(() => expect(screen.getAllByText("My Tasks").length).toBeGreaterThan(0), {
      timeout: 4000,
    });

    // Add a task
    await user.type(screen.getByRole("textbox", { name: "New task" }), "write tests");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(screen.getByText("write tests")).toBeVisible(), { timeout: 8000 });

    // Complete it
    await user.click(screen.getByRole("checkbox", { name: /write tests/i }));
    await waitFor(
      async () => {
        const all = await db.query(lists, {});
        const todos = all.records[0]?.todos ?? [];
        expect(todos.find((t) => t.text === "write tests")?.completed).toBe(true);
      },
      { timeout: 8000 },
    );

    // Delete it
    await user.click(screen.getByRole("button", { name: /delete task write tests/i }));
    await waitFor(
      async () => {
        const all = await db.query(lists, {});
        expect(all.records[0]?.todos ?? []).toHaveLength(0);
      },
      { timeout: 8000 },
    );
  });
});

describe("Tasks concurrency", () => {
  it("regression: a sync update landing between read and write doesn't drop peer todos (AUD-049)", async () => {
    // Seed a list with one todo directly.
    const seeded = await db.put(lists, {
      name: "Race",
      color: "#ff0000",
      todos: [{ id: "x", text: "X", completed: false }],
    });

    // Wrap the db so the op's read resolves first, then a peer/sync update
    // commits BEFORE the op's patch runs — the exact interleaving from the
    // finding. The op still holds the pre-sync view (and its base).
    const interleaved = {
      getWithBase: async (collection: typeof lists, id: string) => {
        const snapshot = await db.getWithBase(collection, id);
        await db.patch(lists, {
          id,
          todos: [...(snapshot.record?.todos ?? []), { id: "y", text: "Y", completed: false }],
        });
        return snapshot;
      },
      patch: (
        collection: typeof lists,
        patch: { id: string; todos: typeof seeded.todos },
        options?: { base?: Uint8Array },
      ) => db.patch(collection, patch, options),
    };

    const ops = createTodoOps(interleaved as unknown as TodoDb);
    await ops.toggleTodo(seeded.id, "x");

    const final = await db.get(lists, seeded.id);
    const ids = final!.todos.map((t) => t.id);
    // The toggle applied AND the peer-added todo survived the stale write.
    expect(ids).toContain("x");
    expect(ids).toContain("y");
    expect(final!.todos.find((t) => t.id === "x")!.completed).toBe(true);
  });
});

describe("Tasks scope-swap wiring", () => {
  it("regression (issue #4): queries follow the swapped db, not the bootstrap-pinned provider", async () => {
    // main.tsx used to pin <DatabaseProvider value={db}> once at page
    // load. After a login→logout cycle the pinned database was the
    // long-gone page-load anonymous db — post-retirement its worker is
    // terminated, so every logged-out query silently timed out (the
    // "wedge until reload" bug). The provider must track the live `db`
    // binding so a re-render serves the current scope's database.
    await openDatabaseForScope(null); // fresh anonymous A
    // main.tsx reads `db` exactly once at bootstrap — model that here
    // instead of the harness's per-call re-read, or the test can't see
    // the pin. `bootstrap` is the page-load database the provider pins.
    const bootstrap = db;
    const pinned = db;
    const session = makeFakeSession();
    const auth = { isAuthenticated: true, session, handle: "alice" };
    setSyncDb(db);
    // Disarm retirement only: a "retired" marker stops RetireAnonymousEffect
    // from deleting the anonymous db mid-test, but adoption re-arms on it
    // and runs during the second render's scope swap — harmlessly here,
    // since earlier suites' wipes leave the anonymous db with no live
    // records to merge.
    localStorage.setItem(
      await adoptionMarkerKey(
        "tasks",
        accountScopeKey(session as unknown as Parameters<typeof accountScopeKey>[0]),
      ),
      "retired",
    );

    // Page load, logged out: pins A in the outer provider (as main.tsx did).
    // (Shell marker, not "My Tasks": earlier suites' wipes tombstone the
    // deterministic default id, which legitimately suppresses re-seeding.)
    const first = renderWithProviders(<App />, { db: pinned });
    await waitFor(() => expect(screen.getAllByText("Lists").length).toBeGreaterThan(0), {
      timeout: 4000,
    });
    first.unmount();

    // Login cycle: anonymous → account → back to a fresh anonymous A2
    const second = renderWithProviders(<App />, { db: pinned, auth });
    await waitFor(() => expect(screen.getAllByText("Lists").length).toBeGreaterThan(0), {
      timeout: 4000,
    });
    second.unmount();

    // Retire the page-load database the way the real logout cycle does
    // (its worker terminates; a pinned handle can no longer serve reads).
    await bootstrap.close();

    await openDatabaseForScope(null); // A2 (fresh — records live in the account db)
    // A record only visible through the CURRENT scope's database
    await db.put(lists, { name: "Probe List", color: "#00ff00", todos: [] });

    const third = renderWithProviders(<App />, { db: pinned });
    await waitFor(() => expect(screen.getAllByText("Probe List").length).toBeGreaterThan(0), {
      timeout: 4000,
    });
    third.unmount();
  });
});
