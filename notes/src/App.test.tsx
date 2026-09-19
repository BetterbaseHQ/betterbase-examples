import { describe, it, expect, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { db, notebooks, notes } from "@/lib/db";
import {
  renderWithProviders,
  makeFakeSession,
  setSyncDb,
  wipeCollections,
  lastProviderProps,
} from "@betterbase/examples-shared/test";

afterEach(async () => {
  await wipeCollections(db, [notes, notebooks]);
});

describe("Notes app sync wiring", () => {
  it("registers both collections with BetterbaseProvider", async () => {
    setSyncDb(db);
    renderWithProviders(<App />, {
      db,
      auth: { isAuthenticated: true, session: makeFakeSession(), handle: "alice" },
    });

    // Wait for the auto-created notebook to appear (created when phase is ready)
    await waitFor(() => expect(screen.getByText("My Notebook")).toBeVisible(), { timeout: 4000 });

    const names = lastProviderProps()
      .collections.map((c) => (c as { name: string }).name)
      .sort();
    expect(names).toEqual(["notebooks", "notes"]);
  });
});

describe("Notes local flow", () => {
  it("regression: edits flush when switching notes quickly (before the debounce fires)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { db }); // unauthenticated → local notes

    // No auto-create on the local path — set up a notebook and first note
    await user.click(screen.getByRole("button", { name: "New notebook" }));
    await user.type(screen.getByRole("textbox", { name: /new notebook/i }), "Notebook");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("Notebook")).toBeVisible(), { timeout: 4000 });
    await user.click(screen.getByRole("button", { name: "New note" }));

    const title = screen.getByLabelText("Note title");
    await user.type(title, "first note title");

    // Switch to another note IMMEDIATELY — the 300ms title debounce has not fired
    await user.click(screen.getByRole("button", { name: "New note" }));

    // The first note's title must still be persisted (flush on switch)
    await waitFor(
      async () => {
        const all = await db.query(notes, {});
        expect(all.records.map((n) => n.title)).toContain("first note title");
      },
      { timeout: 4000 },
    );
  });

  it("regression: deleting a note with a pending edit doesn't error — delete wins", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { db });

    await user.click(screen.getByRole("button", { name: "New notebook" }));
    await user.type(screen.getByRole("textbox", { name: /new notebook/i }), "Notebook");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("Notebook")).toBeVisible(), { timeout: 4000 });
    await user.click(screen.getByRole("button", { name: "New note" }));

    const title = screen.getByLabelText("Note title");
    await user.type(title, "doomed edit");

    // Delete while the edit is still debounced
    await user.click(screen.getByRole("button", { name: "Delete note" }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(
      async () => {
        const all = await db.query(notes, {});
        // The pending edit must not resurrect the deleted note
        expect(all.records.find((n) => n.title === "doomed edit")).toBeUndefined();
      },
      { timeout: 4000 },
    );
  });
});
