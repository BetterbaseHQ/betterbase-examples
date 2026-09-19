import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineTextInput } from "./InlineTextInput";
import { renderWithProviders } from "../test";

describe("InlineTextInput", () => {
  it("submits on Enter when non-empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <InlineTextInput value="hello" onChange={vi.fn()} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    await user.type(screen.getByRole("textbox"), "{Enter}");
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("regression: Enter on empty input cancels instead of submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <InlineTextInput
        value="  "
        onChange={vi.fn()}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await user.type(screen.getByRole("textbox"), "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("cancels on Escape", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithProviders(
      <InlineTextInput value="hello" onChange={vi.fn()} onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    await user.type(screen.getByRole("textbox"), "{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("submits on blur when non-empty, cancels on blur when empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = renderWithProviders(
      <InlineTextInput value="hello" onChange={vi.fn()} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    await user.click(document.body);
    expect(onSubmit).toHaveBeenCalledOnce();

    rerender(
      <InlineTextInput value="" onChange={vi.fn()} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    const input = screen.getByRole("textbox");
    input.focus();
    await user.click(document.body);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
