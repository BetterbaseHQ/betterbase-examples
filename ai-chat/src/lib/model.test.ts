import { describe, expect, it, vi, afterEach } from "vitest";
import {
  MODELS,
  clearModelReady,
  createChatModel,
  getModel,
  isModelReady,
  markModelReady,
  selectedModelId,
  setSelectedModelId,
} from "./model";

class FakeWorker extends EventTarget {
  static last: FakeWorker | undefined;
  constructor() {
    super();
    FakeWorker.last = this;
  }
  terminate() {}
}

describe("model registry", () => {
  it("offers the three tiers with q4f16 exports", () => {
    expect(MODELS.map((m) => m.id)).toEqual(["1.2b", "2.6b", "8b-a1b"]);
    for (const m of MODELS) {
      expect(m.dtype).toBe("q4f16");
      expect(m.repo).toMatch(/^LiquidAI\/LFM2\.5-.+-ONNX$/);
    }
  });

  it("falls back to the default for unknown ids", () => {
    expect(getModel("nope").id).toBe("1.2b");
    expect(getModel("8b-a1b").repo).toContain("8B-A1B");
  });
});

describe("selected model", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("persists the pick and defaults to the 1.2b", () => {
    expect(selectedModelId()).toBe("1.2b");
    setSelectedModelId("8b-a1b");
    expect(selectedModelId()).toBe("8b-a1b");
    setSelectedModelId("bogus");
    expect(selectedModelId()).toBe("1.2b");
  });
});

describe("per-model ready flags", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("tracks each model's cache flag independently", () => {
    expect(isModelReady("1.2b")).toBe(false);
    expect(isModelReady("8b-a1b")).toBe(false);
    markModelReady("8b-a1b");
    expect(isModelReady("8b-a1b")).toBe(true);
    expect(isModelReady("1.2b")).toBe(false);
    clearModelReady("8b-a1b");
    expect(isModelReady("8b-a1b")).toBe(false);
  });
});

describe("createChatModel worker error bridge", () => {
  afterEach(() => {
    FakeWorker.last = undefined;
    vi.unstubAllGlobals();
  });

  it("reports a worker that fails before posting any message", () => {
    vi.stubGlobal("Worker", FakeWorker);

    const onWorkerError = vi.fn();
    const { model, dispose } = createChatModel(MODELS[0]!, onWorkerError);

    const worker = FakeWorker.last;
    expect(worker).toBeInstanceOf(FakeWorker);
    // `transformersJS` must still receive the worker it will message.
    expect(model).toBeDefined();

    worker!.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    expect(onWorkerError).toHaveBeenCalledTimes(1);
    expect(onWorkerError.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect((onWorkerError.mock.calls[0]![0] as Error).message).toContain("boom");

    dispose();
  });
});
