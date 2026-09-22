import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { PhotoCard } from "./components/PhotoCard";
import { db, albums, photos } from "@/lib/db";
import {
  renderWithProviders,
  makeFakeSession,
  setSyncDb,
  wipeCollections,
  setFileUrl,
  setFileUnavailable,
  lastProviderProps,
} from "@betterbase/examples-shared/test";

afterEach(async () => {
  await wipeCollections(db, [photos, albums]);
});

describe("Photos app sync wiring", () => {
  it("registers both collections with BetterbaseProvider", async () => {
    setSyncDb(db);
    renderWithProviders(<App />, {
      db,
      auth: { isAuthenticated: true, session: makeFakeSession(), handle: "alice" },
    });

    await waitFor(() => expect(screen.getAllByText(/photos/i).length).toBeGreaterThan(0), {
      timeout: 4000,
    });

    const names = lastProviderProps()
      .collections.map((c) => (c as { name: string }).name)
      .sort();
    expect(names).toEqual(["albums", "photos"]);
  });
});

describe("PhotoCard unavailable tiles (AUD-048)", () => {
  it("an unavailable tile still offers deletion", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    setFileUnavailable("f-missing");
    // Bytes known missing — useFile reports the unavailable state (failed
    // import, cache eviction, remote never uploaded).
    renderWithProviders(
      <PhotoCard
        photo={
          {
            id: "p1",
            albumId: "a1",
            filename: "broken.jpg",
            caption: "",
            mimeType: "image/jpeg",
            size: 1,
            thumbFileId: null,
            fileId: "f-missing",
            createdAt: 0,
            updatedAt: 0,
          } as never
        }
        style={{ width: 100, height: 100 }}
        onClick={() => {}}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    // Delete is reachable without hovering (no image to hover over)
    await user.click(screen.getByRole("button", { name: /delete broken\.jpg/i }));
    // The confirm dialog mounts asynchronously (Mantine modal) — wait
    // for it instead of racing the sync query.
    await user.click(await screen.findByRole("button", { name: /^Delete$/ }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

describe("PhotoCard accessibility", () => {
  it("regression: photo tile is a div role=button with keyboard activation (was a nested-button violation)", async () => {
    const user = userEvent.setup();
    // The tile renders its interactive surface once the file resolves
    setFileUrl("f1", "data:image/gif;base64,R0lGODlhAQABAAAAACw=");
    let activated = false;
    renderWithProviders(
      <PhotoCard
        photo={
          {
            id: "p1",
            albumId: "a1",
            filename: "sunset.jpg",
            caption: "",
            mimeType: "image/jpeg",
            size: 1,
            thumbFileId: null,
            fileId: "f1",
            createdAt: 0,
            updatedAt: 0,
          } as never
        }
        style={{ width: 100, height: 100 }}
        onClick={() => {
          activated = true;
        }}
        onDelete={() => {}}
      />,
    );

    // Outer tile is a div with role=button — not a button element, so the
    // delete affordance inside it isn't a nested-button violation
    const tile = screen.getByRole("button", { name: /open sunset\.jpg/i });
    expect(tile.tagName).toBe("DIV");

    // The delete affordance appears on hover and is an independent button
    await user.hover(tile);
    expect(screen.queryByRole("button", { name: /delete sunset\.jpg/i })).not.toBeNull();

    tile.focus();
    await user.keyboard("{Enter}");
    expect(activated).toBe(true);
  });
});
