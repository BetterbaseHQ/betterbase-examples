import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { copySecret, cancelPendingClear } from "./clipboard";

// Real clipboard access needs permissions/focus — stub the boundary
const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  vi.useFakeTimers();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  cancelPendingClear();
  vi.useRealTimers();
});

describe("clipboard", () => {
  it("copySecret auto-clears the clipboard after the window elapses", async () => {
    await copySecret("hunter2", 30_000);
    expect(writeText).toHaveBeenCalledWith("hunter2");

    vi.advanceTimersByTime(29_999);
    expect(writeText).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(writeText).toHaveBeenNthCalledWith(2, "");
  });

  it("regression: a plain copy cancels the pending secret auto-clear", async () => {
    await copySecret("hunter2", 30_000);
    // User copies something that is NOT a secret before the timer fires
    cancelPendingClear();
    await navigator.clipboard.writeText("https://example.com");

    vi.advanceTimersByTime(60_000);
    // The plain copy must survive — no clobbering clear
    expect(writeText).toHaveBeenLastCalledWith("https://example.com");
    expect(writeText).not.toHaveBeenCalledWith("");
  });

  it("re-copying a secret resets the clear timer", async () => {
    await copySecret("one", 30_000);
    vi.advanceTimersByTime(20_000);
    await copySecret("two", 30_000);
    vi.advanceTimersByTime(20_000);
    // First timer (40s in) must NOT have fired at the second secret's 20s mark
    expect(writeText).not.toHaveBeenCalledWith("");

    vi.advanceTimersByTime(10_000);
    expect(writeText).toHaveBeenLastCalledWith("");
  });
});
