import { describe, it, expect, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { db, lists } from "@/lib/db";
import {
  renderWithProviders,
  makeFakeSession,
  setSyncDb,
  wipeCollections,
  lastProviderProps,
} from "@betterbase/examples-shared/test";
import { createTodoOps, type TodoDb } from "@/lib/todos";

afterEach(async () => {
  await wipeCollections(db, [lists]);
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
});

describe("Tasks local flow", () => {
  it("adds, completes, and deletes tasks through the real local db", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { db }); // unauthenticated → LocalTasksApp

    // Auto-created default list
    await waitFor(() => expect(screen.getAllByText("My Tasks").length).toBeGreaterThan(0), {
      timeout: 4000,
    });

    // Add a task
    await user.type(screen.getByRole("textbox", { name: "New task" }), "write tests");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(screen.getByText("write tests")).toBeVisible(), { timeout: 4000 });

    // Complete it
    await user.click(screen.getByRole("checkbox", { name: /write tests/i }));
    await waitFor(
      async () => {
        const all = await db.query(lists, {});
        const todos = all.records[0]?.todos ?? [];
        expect(todos.find((t) => t.text === "write tests")?.completed).toBe(true);
      },
      { timeout: 4000 },
    );

    // Delete it
    await user.click(screen.getByRole("button", { name: /delete task write tests/i }));
    await waitFor(
      async () => {
        const all = await db.query(lists, {});
        expect(all.records[0]?.todos ?? []).toHaveLength(0);
      },
      { timeout: 4000 },
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
