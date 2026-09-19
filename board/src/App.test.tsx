import { describe, it, expect, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { db, boards, columns, cards } from "@/lib/db";
import {
  renderWithProviders,
  makeFakeSession,
  setSyncDb,
  wipeCollections,
  lastProviderProps,
} from "@betterbase/examples-shared/test";

// One db per file — tests share it, so wipe records between tests to keep
// them independent (the auto-created board belongs to whichever test ran first)
afterEach(async () => {
  await wipeCollections(db, [cards, columns, boards]);
});

describe("Board app sync wiring", () => {
  it("regression: registers every collection with BetterbaseProvider (columns were once missing — shared boards rendered empty for peers)", async () => {
    setSyncDb(db);
    renderWithProviders(<App />, {
      db,
      auth: { isAuthenticated: true, session: makeFakeSession(), handle: "alice" },
    });

    // Wait for the app to actually mount the synced path (auto-creates a board)
    await waitFor(() => expect(screen.getAllByText(/My Board/i).length).toBeGreaterThan(0));

    const names = lastProviderProps()
      .collections.map((c) => (c as { name: string }).name)
      .sort();
    expect(names).toEqual(["boards", "cards", "columns"]);
  });

  it("synced path renders default columns and adds one through the real local db", async () => {
    const user = userEvent.setup();
    setSyncDb(db);
    renderWithProviders(<App />, {
      db,
      auth: { isAuthenticated: true, session: makeFakeSession(), handle: "alice" },
    });

    // Auto-created board comes with the three default columns
    await waitFor(() => expect(screen.getByText("Done")).toBeVisible(), { timeout: 4000 });
    expect(screen.getByText("In Progress")).toBeVisible();

    // Add a column through the UI and verify it lands in the db
    await user.click(screen.getByRole("button", { name: /add column/i }));
    await user.type(screen.getByRole("textbox", { name: /new column/i }), "Blocked");
    await user.keyboard("{Enter}");
    await waitFor(
      async () => {
        const all = await db.query(columns, {});
        expect(all.records.map((c) => c.name)).toContain("Blocked");
      },
      { timeout: 4000 },
    );
  });
});

describe("Board local cascade deletes", () => {
  it("deleting a board removes its columns and cards from the db", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { db }); // unauthenticated → LocalBoardApp

    await waitFor(() => expect(screen.getByText("Done")).toBeVisible(), { timeout: 4000 });

    // Add a card through the composer (title → Enter → description Enter submits)
    await user.click(screen.getByRole("button", { name: "Add card to To Do" }));
    const title = screen.getByRole("textbox", { name: /card title/i });
    await user.type(title, "cascade me");
    await user.keyboard("{Enter}"); // move to description
    await user.keyboard("{Enter}"); // submit from description
    await waitFor(
      async () => {
        const all = await db.query(cards, {});
        expect(all.records.map((c) => c.title)).toContain("cascade me");
      },
      { timeout: 4000 },
    );

    // Delete the board from the sidebar (ConfirmDialog guards it)
    await user.click(screen.getByRole("button", { name: /delete board/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(
      async () => {
        expect((await db.query(boards, {})).records).toHaveLength(0);
        expect((await db.query(columns, {})).records).toHaveLength(0);
        expect((await db.query(cards, {})).records).toHaveLength(0);
      },
      { timeout: 4000 },
    );
  });
});
