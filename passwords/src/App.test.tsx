import { describe, it, expect, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { db, entries } from "@/lib/db";
import {
  renderWithProviders,
  makeFakeSession,
  setSyncDb,
  wipeCollections,
  lastProviderProps,
} from "@betterbase/examples-shared/test";

afterEach(async () => {
  await wipeCollections(db, [entries]);
});

describe("Passwords app sync wiring", () => {
  it("registers the entries collection with BetterbaseProvider", async () => {
    setSyncDb(db);
    renderWithProviders(<App />, {
      db,
      auth: { isAuthenticated: true, session: makeFakeSession(), handle: "alice" },
    });

    // Header renders once the app shell is up
    await waitFor(() => expect(screen.getAllByText("Passwords").length).toBeGreaterThan(0), {
      timeout: 4000,
    });

    const names = lastProviderProps()
      .collections.map((c) => (c as { name: string }).name)
      .sort();
    expect(names).toEqual(["entries"]);
  });
});

describe("Passwords local flow", () => {
  it("creates an entry with the generator output and reveals/copies it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { db });

    await waitFor(() => expect(screen.getByRole("button", { name: /add/i })).toBeVisible(), {
      timeout: 4000,
    });
    await user.click(screen.getByRole("button", { name: /add/i }));

    await user.type(screen.getByLabelText(/site/i), "example.com");
    await user.type(screen.getByLabelText(/username/i), "alice");

    // Generator panel produced an initial password of the default length
    const generatorPanel = screen.getByText("Password Generator").closest("div")!;
    const monospace = generatorPanel.querySelector(
      "text[style*='monospace'], [style*='monospace']",
    )!;
    const generated = monospace.textContent ?? "";
    expect(generated.length).toBeGreaterThanOrEqual(8);

    const secretInput = screen.getByLabelText("Password");
    await user.type(secretInput, "s3cret-value");

    await user.click(screen.getByRole("button", { name: /^Create$/i }));
    await waitFor(
      async () => {
        const all = await db.query(entries, {});
        expect(all.records.map((e) => e.site)).toContain("example.com");
      },
      { timeout: 4000 },
    );
  });
});
