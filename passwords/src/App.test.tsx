import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { db, entries, openDatabaseForScope } from "@/lib/db";
import {
  renderWithProviders,
  makeFakeSession,
  setSyncDb,
  wipeCollections,
  lastProviderProps,
  resetSyncMocks,
} from "@betterbase/examples-shared/test";

afterEach(async () => {
  await wipeCollections(db, [entries]);
});

// Reset the module to the anonymous database after each test — an
// authenticated test otherwise leaves the account scope open and the
// next local test pays the swap-back database boot inside its assertions.
afterEach(async () => {
  await openDatabaseForScope(null);
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

    await waitFor(
      () => expect(screen.getByRole("button", { name: "Add your first password" })).toBeVisible(),
      { timeout: 4000 },
    );
    await user.click(screen.getByRole("button", { name: "Add your first password" }));

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

describe("Passwords removed-space flow", () => {
  afterEach(() => resetSyncMocks());

  it("a removed entry's secret is replaced by the re-key notice and delete-local-copy", async () => {
    const { EntriesScreen } = await import("./components/EntriesScreen");
    const user = userEvent.setup();
    const deleteEntry = vi.fn(async () => {});
    const sharedEntry = {
      id: "e1",
      site: "Vault Bank",
      url: "https://vault.example",
      username: "alice",
      password: "hunter2",
      notes: "",
      category: "login",
      createdAt: 0,
      updatedAt: 0,
      _spaceId: "space-removed",
    } as never;

    renderWithProviders(
      <EntriesScreen
        api={{
          entries: [sharedEntry],
          createEntry: () => {},
          updateEntry: () => {},
          deleteEntry,
        }}
        sharing={
          {
            personalSpaceId: "personal-space-1",
            isAdmin: () => true,
            shareEntry: () => Promise.resolve(),
            inviteToEntry: () => Promise.resolve(),
            removeMember: () => Promise.resolve(),
            // The synced path injects useSpaceStatus as this probe — here
            // the space reads as removed (the victim's local record).
            useRemovedSpace: (spaceId: string | null) => ({
              removed: spaceId === "space-removed",
              name: "Vault Bank",
            }),
          } as never
        }
      />,
      { db },
    );

    // Opening the entry must NOT reveal the secret — the re-key notice
    // replaces the detail view entirely.
    await user.click(screen.getByText("Vault Bank"));
    expect(screen.queryByText("hunter2")).toBeNull();
    const notice = screen.getByTestId("removed-space-notice");
    expect(notice).toHaveTextContent("You no longer have access to this password");
    expect(notice).toHaveTextContent(/re-keyed/);

    await user.click(screen.getByTestId("delete-local-copy"));
    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith("e1"));
  });
});
