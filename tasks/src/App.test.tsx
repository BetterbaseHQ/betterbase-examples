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
