import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectSyncModal } from "./ConnectSyncModal";
import { renderWithProviders } from "../test";

function renderModal(props: Partial<Parameters<typeof ConnectSyncModal>[0]> = {}) {
  const onClose = vi.fn();
  renderWithProviders(
    <ConnectSyncModal
      opened
      onClose={onClose}
      onConnect={props.onConnect ?? vi.fn().mockResolvedValue(undefined)}
      error={props.error}
    />,
  );
  return { onClose };
}

describe("ConnectSyncModal", () => {
  it("closes after a successful connect", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: /continue with betterbase account/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("regression: stays open and shows the error when connect fails", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal({
      onConnect: vi.fn().mockRejectedValue(new Error("network down")),
      error: "network down",
    });
    await user.click(screen.getByRole("button", { name: /continue with betterbase account/i }));
    // Modal must still be open (dialog in the document, not closed)
    await waitFor(() =>
      expect(screen.getByText("network down")).toBeVisible(),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("does not show a stale session error until the user attempts to connect", async () => {
    const user = userEvent.setup();
    renderModal({ error: "stale session error" });
    expect(screen.queryByText("stale session error")).toBeNull();

    await user.click(screen.getByRole("button", { name: /continue with betterbase account/i }));
    await waitFor(() =>
      expect(screen.getByText("stale session error")).toBeVisible(),
    );
  });

  it("escape while connecting does not close the modal", async () => {
    const user = userEvent.setup();
    let resolveConnect!: () => void;
    const { onClose } = renderModal({
      onConnect: () => new Promise<void>((r) => (resolveConnect = r)),
    });
    await user.click(screen.getByRole("button", { name: /continue with betterbase account/i }));
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    resolveConnect();
  });

  it("'Maybe later' closes the modal", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: /maybe later/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
