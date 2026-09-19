import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { useHeaderSyncStatus, type SyncStatus } from "./useHeaderSyncStatus";
import { renderWithProviders, setSyncState } from "../test";

// `betterbase/sync/react` resolves to the harness stub via the test config's
// alias — no vi.mock needed.

function StatusProbe() {
  const status: SyncStatus = useHeaderSyncStatus();
  return <div data-testid="status">{status}</div>;
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value: online,
    configurable: true,
  });
}

afterEach(() => {
  setOnline(true);
  setSyncState({ phase: "ready", syncing: false, error: null });
});

describe("useHeaderSyncStatus", () => {
  it("reports offline when the browser is offline", () => {
    setOnline(false);
    renderWithProviders(<StatusProbe />);
    expect(screen.getByTestId("status")).toHaveTextContent("offline");
  });

  it("reports error when sync has an error", () => {
    setSyncState({ error: "boom" });
    renderWithProviders(<StatusProbe />);
    expect(screen.getByTestId("status")).toHaveTextContent("error");
  });

  it("reports syncing while an operation is in flight", () => {
    setSyncState({ syncing: true });
    renderWithProviders(<StatusProbe />);
    expect(screen.getByTestId("status")).toHaveTextContent("syncing");
  });

  it("regression: reports syncing during the connecting/bootstrap phases, not 'synced'", () => {
    // Before the fix, phase was ignored and a connecting engine showed "Synced"
    setSyncState({ phase: "connecting", syncing: false });
    const { rerender } = renderWithProviders(<StatusProbe />);
    expect(screen.getByTestId("status")).toHaveTextContent("syncing");

    setSyncState({ phase: "bootstrapping" });
    rerender(<StatusProbe />);
    expect(screen.getByTestId("status")).toHaveTextContent("syncing");
  });

  it("reports synced once ready and idle", () => {
    setSyncState({ phase: "ready", syncing: false, error: null });
    renderWithProviders(<StatusProbe />);
    expect(screen.getByTestId("status")).toHaveTextContent("synced");
  });
});
