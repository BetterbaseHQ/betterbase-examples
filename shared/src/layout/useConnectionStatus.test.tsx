import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { useConnectionStatus, type ConnectionStatus } from "betterbase/sync/react";
import { renderWithProviders, setSyncState } from "../test";

// `betterbase/sync/react` resolves to the SDK testing stub via the test
// config's alias; the stub derives from the same pure function as the real
// hook, driven here by setSyncState + navigator.onLine.

function StatusProbe() {
  const status: ConnectionStatus = useConnectionStatus();
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

describe("useConnectionStatus (via SDK testing stub)", () => {
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

  it("reports syncing during the connecting/bootstrap phases, not 'synced'", () => {
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
