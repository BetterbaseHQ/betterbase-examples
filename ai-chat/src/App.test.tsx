import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UIMessageChunk } from "ai";
import { renderWithProviders } from "@betterbase/examples-shared/test";
import App from "./App";

/**
 * The model and transport boundaries are stubbed: real inference needs WebGPU
 * and a ~760 MB download, which has no place in a unit test. These tests pin
 * the UI lifecycle (gate → load → progress → chat), the streaming render, and
 * the failure/retry paths.
 */
const harness = vi.hoisted(() => ({
  progress: null as null | ((progress: number) => void),
  resolveLoad: null as null | (() => void),
  rejectLoad: null as null | ((error: Error) => void),
  sendMessages: vi.fn(),
  dispose: vi.fn(),
}));

/**
 * Force `navigator.gpu` so the real WebGPU gate is exercised, not mocked.
 * Defined on the live navigator (rather than replacing it) so user-event's
 * clipboard plumbing keeps working.
 */
const originalGpu = Object.getOwnPropertyDescriptor(navigator, "gpu");

function stubWebGpu(available: boolean) {
  Object.defineProperty(navigator, "gpu", {
    value: available ? {} : undefined,
    configurable: true,
  });
}

vi.mock("@/lib/model", () => ({
  MODEL_LABEL: "LFM2.5 1.2B Instruct",
  MODEL_APPROX_LABEL: "~760 MB",
  createChatModel: () => {
    const dispose = vi.fn();
    harness.dispose = dispose;
    return { model: { modelId: "stub-model" }, dispose };
  },
  loadModel: (_model: unknown, onProgress?: (progress: number) => void) => {
    harness.progress = onProgress ?? null;
    return new Promise<void>((resolve, reject) => {
      harness.resolveLoad = resolve;
      harness.rejectLoad = reject;
    });
  },
}));

vi.mock("@/lib/chat-transport", () => ({
  LocalChatTransport: class {
    sendMessages = harness.sendMessages;
    reconnectToStream = async () => null;
  },
}));

/** Minimal but valid UI message stream: one text part, then finish. */
function replyStream(text: string): ReadableStream<UIMessageChunk> {
  const chunks: UIMessageChunk[] = [
    { type: "start", messageId: "assistant-1" },
    { type: "start-step" },
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: text },
    { type: "text-end", id: "text-1" },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ];
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

/** Drives the app from the load screen to a ready chat. */
async function loadModelThroughUi() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /download .* model/i }));
  await act(async () => {
    harness.progress?.(1);
    harness.resolveLoad?.();
  });
  await screen.findByLabelText("Message");
  return user;
}

beforeEach(() => {
  stubWebGpu(true);
  harness.progress = null;
  harness.resolveLoad = null;
  harness.rejectLoad = null;
  harness.dispose.mockReset();
  harness.sendMessages.mockReset();
  harness.sendMessages.mockImplementation(async () => replyStream("Four."));
});

afterEach(() => {
  if (originalGpu) Object.defineProperty(navigator, "gpu", originalGpu);
  else delete (navigator as { gpu?: unknown }).gpu;
});

describe("AI Chat app", () => {
  it("blocks with a WebGPU requirement when the browser can't run the model", async () => {
    stubWebGpu(false);
    renderWithProviders(<App />);

    expect(await screen.findByText(/webgpu required/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /download/i })).toBeNull();
  });

  it("shows download progress while the model loads, then the chat", async () => {
    renderWithProviders(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /download .* model/i }));

    await act(async () => {
      harness.progress?.(0.42);
    });
    expect(await screen.findByText(/42%/)).toBeVisible();

    await act(async () => {
      harness.progress?.(1);
      harness.resolveLoad?.();
    });
    expect(await screen.findByLabelText("Message")).toBeVisible();
    expect(screen.queryByText(/downloading model weights/i)).toBeNull();
  });

  it("streams an assistant reply after sending a message", async () => {
    renderWithProviders(<App />);
    const user = await loadModelThroughUi();

    await user.type(screen.getByLabelText("Message"), "What is 2 + 2?");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Four.")).toBeVisible();
    expect(screen.getByText("What is 2 + 2?")).toBeVisible();

    const sent = harness.sendMessages.mock.calls[0]![0];
    const last = sent.messages.at(-1);
    expect(last?.role).toBe("user");
    expect(last?.parts).toContainEqual({ type: "text", text: "What is 2 + 2?" });
  });

  it("does not send an empty message", async () => {
    renderWithProviders(<App />);
    const user = await loadModelThroughUi();

    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(harness.sendMessages).not.toHaveBeenCalled();
    expect(screen.getByText(/ask the local model/i)).toBeVisible();
  });

  it("surfaces a model load failure and offers a retry", async () => {
    renderWithProviders(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /download .* model/i }));
    await act(async () => {
      harness.rejectLoad?.(new Error("WebGPU out of memory"));
    });

    expect(await screen.findByText(/couldn't load the model/i)).toBeVisible();
    expect(screen.getByText("WebGPU out of memory")).toBeVisible();
    expect(screen.getByRole("button", { name: /retry download/i })).toBeVisible();
  });

  it("terminates the failed worker before retrying", async () => {
    renderWithProviders(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /download .* model/i }));
    const firstDispose = harness.dispose;
    await act(async () => {
      harness.rejectLoad?.(new Error("boom"));
    });

    await user.click(await screen.findByRole("button", { name: /retry download/i }));

    expect(firstDispose).toHaveBeenCalled();
    expect(screen.getByText(/downloading model weights/i)).toBeVisible();
  });

  it("shows the real error when generation fails", async () => {
    harness.sendMessages.mockRejectedValueOnce(new Error("WebGPU device lost"));
    renderWithProviders(<App />);
    const user = await loadModelThroughUi();

    await user.type(screen.getByLabelText("Message"), "hello");
    await user.keyboard("{Enter}");

    expect(await screen.findByText(/generation failed/i)).toBeVisible();
    expect(screen.getByText("WebGPU device lost")).toBeVisible();
  });
});
