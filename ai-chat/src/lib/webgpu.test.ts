import { describe, it, expect, afterEach, vi } from "vitest";
import { isWebGpuAvailable } from "@/lib/webgpu";

describe("isWebGpuAvailable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false when the browser exposes no WebGPU adapter", () => {
    vi.stubGlobal("navigator", {});
    expect(isWebGpuAvailable()).toBe(false);
  });

  it("is false when navigator.gpu is present but undefined", () => {
    vi.stubGlobal("navigator", { gpu: undefined });
    expect(isWebGpuAvailable()).toBe(false);
  });

  it("is true when navigator.gpu is available", () => {
    vi.stubGlobal("navigator", { gpu: {} });
    expect(isWebGpuAvailable()).toBe(true);
  });
});
