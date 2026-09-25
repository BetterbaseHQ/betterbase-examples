import { describe, it, expect, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { db, boards, columns, cards, openDatabaseForScope } from "@/lib/db";
import {
  renderWithProviders,
  makeFakeSession,
  setSyncDb,
  wipeCollections,
  lastProviderProps,
} from "@betterbase/examples-shared/test";
import { createBoardWithColumns } from "./App";

// One db per file — tests share it, so wipe records between tests.
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

    // The sync-status badge only renders on the authenticated path.
    await waitFor(() =>
      expect(document.querySelector('[data-testid^="sync-status-"]')).not.toBeNull(), {
      timeout: 4000,
    });

    const names = lastProviderProps()
      .collections.map((c) => (c as { name: string }).name)
      .sort();
    expect(names).toEqual(["boards", "cards", "columns"]);
  });

  it("a board created through the UI comes with columns; adding one lands in the db", async () => {
    const user = userEvent.setup();
    await openDatabaseForScope("board-columns-test");
    setSyncDb(db);
    renderWithProviders(<App />, {
      db,
      auth: {
        isAuthenticated: true,
        session: makeFakeSession({ getPersonalSpaceId: () => "board-columns-test" }),
        handle: "alice",
      },
    });

    // Empty workspace: create a board through the sidebar — it comes with
    // the three default columns
    await user.type(await screen.findByRole("textbox", { name: /new board/i }), "Roadmap");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("Done")).toBeVisible(), { timeout: 8000 });
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
      { timeout: 8000 },
    );
  });

  it("remounting neither duplicates nor creates boards", async () => {
    // Nothing auto-creates: a user-created board stays exactly one across
    // a full remount.
    const user = userEvent.setup();
    await openDatabaseForScope("board-remount-test");
    const session = makeFakeSession({ getPersonalSpaceId: () => "board-remount-test" });
    const auth = { isAuthenticated: true, session, handle: "alice" };
    setSyncDb(db);

    const first = renderWithProviders(<App />, { db, auth });
    await user.type(await screen.findByRole("textbox", { name: /new board/i }), "Roadmap");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("Done")).toBeVisible(), { timeout: 8000 });
    first.unmount();

    renderWithProviders(<App />, { db, auth });
    await waitFor(
      () => expect(screen.getAllByText("Roadmap").length).toBeGreaterThan(0),
      { timeout: 8000 },
    );
    await new Promise((r) => setTimeout(r, 150));

    const all = await db.query(boards, {});
    // Exactly one board and its three columns — catches any regression
    // that auto-creates scaffolding alongside user data
    expect(all.records).toHaveLength(1);
    expect((await db.query(columns, {})).records).toHaveLength(3);
  });
});

describe("Board local cascade deletes", () => {
  it("deleting a board removes its columns and cards from the db", async () => {
    const user = userEvent.setup();
    await openDatabaseForScope(null); // align scope — no swap/boot at mount
    renderWithProviders(<App />, { db }); // unauthenticated → LocalBoardApp

    await createBoardWithColumns("Cascade Board");
    await waitFor(() => expect(screen.getByText("Done")).toBeVisible(), { timeout: 8000 });

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
      { timeout: 8000 },
    );

    // Delete the board from the sidebar (ConfirmDialog guards it). The modal
    // animates in — findByRole waits for the confirm button to appear.
    await user.click(screen.getByRole("button", { name: /delete board/i }));
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));

    await waitFor(
      async () => {
        expect((await db.query(boards, {})).records).toHaveLength(0);
        expect((await db.query(columns, {})).records).toHaveLength(0);
        expect((await db.query(cards, {})).records).toHaveLength(0);
      },
      { timeout: 8000 },
    );
  });

  it("AUD-054: deleting a column cascades its cards through the gated tree", async () => {
    const user = userEvent.setup();
    await openDatabaseForScope(null);
    renderWithProviders(<App />, { db }); // unauthenticated → LocalBoardApp

    const cascadeBoard = await createBoardWithColumns("Column Cascade Board");
    await waitFor(() => expect(screen.getByText("Done")).toBeVisible(), { timeout: 8000 });

    // Add a card to the first column.
    await user.click(screen.getByRole("button", { name: "Add card to To Do" }));
    const title = screen.getByRole("textbox", { name: /card title/i });
    await user.type(title, "cascade with column");
    await user.keyboard("{Enter}"); // move to description
    await user.keyboard("{Enter}"); // submit from description
    await waitFor(
      async () => {
        const all = await db.query(cards, {});
        expect(all.records.map((c) => c.title)).toContain("cascade with column");
      },
      { timeout: 8000 },
    );

    // Delete the column (confirm-guarded like board deletion). The card
    // must go with it — the column delete is gated on its cards
    // (deleteTree), so no orphaned survivor can hide.
    await user.click(screen.getByRole("button", { name: "Delete column To Do" }));
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));

    await waitFor(
      async () => {
        // Scoped to this board: other suites may hold columns of their
        // own boards — the cascade property is that THIS board's columns
        // go with the delete.
        const remaining = (await db.query(columns, {})).records.filter(
          (c) => c.boardId === cascadeBoard.id,
        );
        expect(remaining).toHaveLength(2);
        expect((await db.query(cards, {})).records).toHaveLength(0);
      },
      { timeout: 8000 },
    );
  });
});
