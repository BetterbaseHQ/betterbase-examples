import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RemovedSpaceNotice } from "./RemovedSpaceNotice";
import { renderWithProviders } from "../test";

describe("RemovedSpaceNotice", () => {
  it("explains the re-key in the app's own vocabulary", () => {
    renderWithProviders(<RemovedSpaceNotice kindLabel="conversation" name="Design sync" />);
    const notice = screen.getByTestId("removed-space-notice");
    expect(notice).toHaveTextContent("You no longer have access to this conversation");
    expect(notice).toHaveTextContent('"Design sync" was re-keyed');
    expect(notice).toHaveTextContent(/keys this device doesn't have/);
  });

  it("falls back gracefully without a name", () => {
    renderWithProviders(<RemovedSpaceNotice kindLabel="vault" name={null} />);
    expect(screen.getByTestId("removed-space-notice")).toHaveTextContent("It was re-keyed");
  });

  it("offers local deletion only when the app provides it", async () => {
    const user = userEvent.setup();
    const onDeleteLocalCopy = vi.fn();
    const { unmount } = renderWithProviders(<RemovedSpaceNotice kindLabel="vault" name={null} />);
    expect(screen.queryByTestId("delete-local-copy")).not.toBeInTheDocument();
    unmount();

    renderWithProviders(
      <RemovedSpaceNotice kindLabel="vault" name={null} onDeleteLocalCopy={onDeleteLocalCopy} />,
    );
    await user.click(screen.getByTestId("delete-local-copy"));
    expect(onDeleteLocalCopy).toHaveBeenCalledTimes(1);
  });
});
