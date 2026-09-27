import { describe, expect, it, vi, afterEach } from "vitest";
import { createChatModel } from "./model";

class FakeWorker extends EventTarget {
  static last: FakeWorker | undefined;
  constructor() {
    super();
    FakeWorker.last = this;
  }
  terminate() {}
}

describe("createChatModel worker error bridge", () => {
  afterEach(() => {
    FakeWorker.last = undefined;
    vi.unstubAllGlobals();
  });

  it("reports a worker that fails before posting any message", () => {
    vi.stubGlobal("Worker", FakeWorker);

    const onWorkerError = vi.fn();
    const { model, dispose } = createChatModel(onWorkerError);

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
