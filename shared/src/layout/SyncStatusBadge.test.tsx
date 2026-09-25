import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncStatusBadge } from "./SyncStatusBadge";
import { renderWithProviders } from "../test";

function renderBadge(
  status: Parameters<typeof SyncStatusBadge>[0]["status"],
  errorDetail?: string,
) {
  renderWithProviders(<SyncStatusBadge status={status} errorDetail={errorDetail} />);
  return screen.getByTestId(`sync-status-${status}`);
}

describe("SyncStatusBadge", () => {
  const LABELS: [Parameters<typeof SyncStatusBadge>[0]["status"], string][] = [
    ["synced", "Synced"],
    ["syncing", "Syncing"],
    ["offline", "Offline"],
    ["error", "Sync error"],
  ];

  it("renders every status with its label and stable testid", () => {
    for (const [status, label] of LABELS) {
      const { unmount } = renderWithProviders(<SyncStatusBadge status={status} />);
      expect(screen.getByTestId(`sync-status-${status}`)).toHaveTextContent(label);
      unmount();
    }
  });

  it("the encryption note is the tooltip content on healthy states", async () => {
    const user = userEvent.setup();
    const badge = renderBadge("synced");
    await user.hover(badge);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/end-to-end encrypted/i);
    expect(screen.getByRole("tooltip").textContent).not.toMatch(/Couldn't reach/);
  });

  it("error: surfaces the sync error detail alongside the encryption note", async () => {
    const user = userEvent.setup();
    const badge = renderBadge("error", "WebSocket closed unexpectedly");
    await user.hover(badge);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("WebSocket closed unexpectedly");
    expect(tooltip).toHaveTextContent(/end-to-end encrypted/i);
  });

  it("error without detail falls back to a readable failure line", async () => {
    const user = userEvent.setup();
    const badge = renderBadge("error");
    await user.hover(badge);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/Couldn't reach the sync server/);
  });

  it("the badge is focusable so keyboard users reach the tooltip", () => {
    const badge = renderBadge("synced");
    expect(badge).toHaveAttribute("tabindex", "0");
  });
});
