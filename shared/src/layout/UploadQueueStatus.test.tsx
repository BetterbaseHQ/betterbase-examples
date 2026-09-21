import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadQueueStatus, effectiveSyncStatus } from "./UploadQueueStatus";
import { renderWithProviders } from "../test";

function renderQueue(
  pending: number,
  errored: number,
  onRetry = vi.fn().mockResolvedValue(undefined),
) {
  renderWithProviders(<UploadQueueStatus pending={pending} errored={errored} onRetry={onRetry} />);
  return { onRetry };
}

describe("UploadQueueStatus (AUD-052)", () => {
  it("renders nothing when the queue is empty", () => {
    renderQueue(0, 0);
    expect(screen.queryByTestId("upload-queue-pending")).toBeNull();
    expect(screen.queryByTestId("upload-queue-error")).toBeNull();
  });

  it("shows a pending count while bytes are queued", () => {
    renderQueue(3, 0);
    expect(screen.getByTestId("upload-queue-pending")).toHaveTextContent("Uploading 3");
  });

  it("shows failed uploads with a retry control", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderQueue(1, 2);
    const badge = screen.getByTestId("upload-queue-error");
    expect(badge).toHaveTextContent("2 uploads failed");
    await user.click(screen.getByRole("button", { name: /retry failed uploads/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("a failure takes precedence over the pending indicator", () => {
    renderQueue(3, 1);
    expect(screen.getByTestId("upload-queue-error")).toBeInTheDocument();
    expect(screen.queryByTestId("upload-queue-pending")).toBeNull();
  });
});

describe("effectiveSyncStatus (AUD-052)", () => {
  it.each(["synced", "syncing", "offline", "error"] as const)(
    "passes %s through when no uploads are queued",
    (status) => {
      expect(effectiveSyncStatus(status, 0)).toBe(status);
    },
  );

  it("downgrades Synced to Syncing while uploads are pending", () => {
    expect(effectiveSyncStatus("synced", 2)).toBe("syncing");
  });

  it("leaves offline and error states alone even with uploads queued", () => {
    expect(effectiveSyncStatus("offline", 2)).toBe("offline");
    expect(effectiveSyncStatus("error", 2)).toBe("error");
  });
});
