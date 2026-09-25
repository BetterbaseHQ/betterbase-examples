import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { db, notebooks, notes, openDatabaseForScope } from "@/lib/db";
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

    await waitFor(() => expect(screen.getAllByText(/notebooks/i).length).toBeGreaterThan(0), {
      timeout: 4000,
    });

    const names = lastProviderProps()
      .collections.map((c) => (c as { name: string }).name)
      .sort();
    expect(names).toEqual(["notebooks", "notes"]);
  });

  it("remounting neither duplicates nor creates notebooks", async () => {
    // Nothing auto-creates: a user-created notebook stays exactly one
    // across a full remount.
    const user = userEvent.setup();
    await openDatabaseForScope("notebook-remount-test");
    const session = makeFakeSession({ getPersonalSpaceId: () => "notebook-remount-test" });
    const auth = { isAuthenticated: true, session, handle: "alice" };
    setSyncDb(db);

    const first = renderWithProviders(<App />, { db, auth });
    await waitFor(() => expect(screen.getAllByText(/notebooks/i).length).toBeGreaterThan(0), {
      timeout: 4000,
    });
    await user.type(await screen.findByRole("textbox", { name: /new notebook/i }), "Journal");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("Journal")).toBeVisible(), { timeout: 4000 });
    first.unmount();

    renderWithProviders(<App />, { db, auth });
    await waitFor(() => expect(screen.getByText("Journal")).toBeVisible(), { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 150));

    const all = await db.query(notebooks, {});
    expect(all.records.filter((r) => r.name === "Journal")).toHaveLength(1);
  });
});

describe("Notes local flow", () => {
  it("regression: edits flush when switching notes quickly (before the debounce fires)", async () => {
    const user = userEvent.setup();
    await openDatabaseForScope(null); // align scope — no swap/boot at mount
    renderWithProviders(<App />, { db }); // unauthenticated → local notes

    // No auto-create on the local path — set up a notebook and first note
    // (the sidebar's create input is always visible)
    await user.type(await screen.findByRole("textbox", { name: /new notebook/i }), "Notebook");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("Notebook")).toBeVisible(), { timeout: 4000 });
    await user.click(screen.getByRole("button", { name: "New note" }));

    // The create handler is fire-and-forget (db put, then select) — the
    // editor mounts asynchronously, so this must retry (CI loses the race)
    const title = await screen.findByLabelText("Note title", {}, { timeout: 4000 });
    await user.type(title, "first note title");

    // Switch to another note IMMEDIATELY and type in it — the new note's
    // debounce replaces the pending timer, so without a flush-on-switch the
    // first note's captured args would be dropped (the bug this pins)
    await user.click(screen.getByRole("button", { name: "New note" }));
    await user.type(await screen.findByLabelText("Note title", {}, { timeout: 4000 }), "2");

    // The first note's title must still be persisted despite the replaced timer
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
    await openDatabaseForScope(null); // align scope — no swap/boot at mount
    renderWithProviders(<App />, { db });

    await user.type(await screen.findByRole("textbox", { name: /new notebook/i }), "Notebook");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("Notebook")).toBeVisible(), { timeout: 4000 });
    await user.click(screen.getByRole("button", { name: "New note" }));

    const title = await screen.findByLabelText("Note title", {}, { timeout: 4000 });
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

describe("Notes concurrency", () => {
  it("regression: a peer title update mid-debounce doesn't discard the pending draft (AUD-046)", async () => {
    const user = userEvent.setup();
    await openDatabaseForScope(null); // align scope — no swap/boot at mount
    renderWithProviders(<App />, { db });

    await user.type(await screen.findByRole("textbox", { name: /new notebook/i }), "Notebook");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("Notebook")).toBeVisible(), { timeout: 4000 });
    await user.click(screen.getByRole("button", { name: "New note" }));

    const title = await screen.findByLabelText("Note title", {}, { timeout: 4000 });
    await user.type(title, "abc");
    const noteId = (await db.query(notes, {})).records[0]!.id;

    const patchSpy = vi.spyOn(db, "patch");

    // Peer/sync title update lands while "abc" is still only in the
    // debounce queue (the 300ms timer has not fired). The peer writes
    // base-anchored on the version both sides rendered — a synced peer
    // delivers CRDT ops, never a local view-diff full-value write.
    const { base: sharedBase } = await db.getWithBase(notes, noteId);
    await db.patch(
      notes,
      { id: noteId, title: "peer edit" },
      sharedBase ? { base: sharedBase } : undefined,
    );
    await waitFor(() => expect(screen.getByLabelText("Note title")).toHaveValue("peer edit"), {
      timeout: 4000,
    });

    // Wait for the flushed draft to be merged and the input rebased to the
    // result before typing — without this the keystroke can land on either
    // the pre-merge or post-merge input, making the final-value assertion
    // racy (LWW for t.string()).
    await waitFor(() => expect(screen.getByLabelText("Note title")).toHaveValue("abc"));

    // Type on the rebased input — this replaces the pending debounced args;
    // pre-fix, "abc" would never reach the database.
    await user.type(title, "!");

    await waitFor(
      () => {
        const flushed = patchSpy.mock.calls.some(
          ([, p]) => (p as { title?: string }).title === "abc",
        );
        expect(flushed).toBe(true);
      },
      { timeout: 4000 },
    );
    patchSpy.mockRestore();
    // title is t.string() (LWW): the flushed draft ("abc") participates in
    // the conflict and, being the later write in this session, wins the
    // race — pre-fix it never reached the database and the final title
    // would be just "peer edit!".
    await waitFor(
      async () => {
        const final = await db.get(notes, noteId);
        expect(final!.title).toBe("abc!");
      },
      { timeout: 4000 },
    );
  });
});
