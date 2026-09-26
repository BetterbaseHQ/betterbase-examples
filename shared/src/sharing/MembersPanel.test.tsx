import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MembersPanel } from "./MembersPanel";
import { renderWithProviders } from "../test";
import { resetSyncMocks, setSpaceMembers, setSpaceStatus } from "betterbase/testing";

const SPACE = "space-1";

function renderPanel() {
  const onRemoveMember = vi.fn();
  renderWithProviders(
    <MembersPanel spaceId={SPACE} isAdmin onInvite={vi.fn()} onRemoveMember={onRemoveMember} />,
  );
  return { onRemoveMember };
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTitle("Members"));
  // Mantine portals the dropdown in async (floating-ui positioning) — wait
  // for its content before interacting.
  await screen.findByText("bob@test");
}

describe("MembersPanel", () => {
  beforeEach(() => {
    resetSyncMocks();
    setSpaceStatus(SPACE, { status: "active", epoch: 1, role: "admin", name: "Team" });
    setSpaceMembers(SPACE, [
      { did: "did:key:victim", role: "write", status: "joined", handle: "bob@test" },
    ]);
  });

  it("shows re-keying progress while removal is in flight, then the epoch confirmation", async () => {
    const user = userEvent.setup();
    const { onRemoveMember } = renderPanel();
    await openPanel(user);

    let resolveRemove: (() => void) | undefined;
    onRemoveMember.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRemove = resolve;
      }),
    );

    // Two-click confirm: arm, then start the removal.
    await user.click(screen.getByRole("button", { name: "Remove member" }));
    await user.click(screen.getByRole("button", { name: "Confirm remove member" }));

    expect(onRemoveMember).toHaveBeenCalledWith("did:key:victim");
    expect(screen.getByTestId("removing-status")).toHaveTextContent(/re-keying/);

    // The rotation lands while the removal await is still open.
    act(() => setSpaceStatus(SPACE, { epoch: 2 }));
    await act(async () => resolveRemove!());

    const notice = await screen.findByTestId("rekeyed-notice");
    expect(notice).toHaveTextContent("bob@test");
    expect(notice).toHaveTextContent("Encryption epoch 2");
  });

  it("does not claim a re-key when removal fails", async () => {
    const user = userEvent.setup();
    const { onRemoveMember } = renderPanel();
    await openPanel(user);

    onRemoveMember.mockRejectedValue(new Error("not admin"));

    await user.click(screen.getByRole("button", { name: "Remove member" }));
    await user.click(screen.getByRole("button", { name: "Confirm remove member" }));

    expect(await screen.findByText("not admin")).toBeInTheDocument();
    expect(screen.queryByTestId("rekeyed-notice")).not.toBeInTheDocument();
  });

  it("clears the confirmation when the popover closes", async () => {
    const user = userEvent.setup();
    const { onRemoveMember } = renderPanel();
    await openPanel(user);
    onRemoveMember.mockResolvedValue(undefined);

    await user.click(screen.getByRole("button", { name: "Remove member" }));
    await user.click(screen.getByRole("button", { name: "Confirm remove member" }));
    expect(await screen.findByTestId("rekeyed-notice")).toBeInTheDocument();

    await user.click(screen.getByTitle("Members"));
    // Mantine unmounts the dropdown after its close transition.
    await waitFor(() => expect(screen.queryByTestId("rekeyed-notice")).not.toBeInTheDocument());
  });
});
