import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@betterbase/examples-shared/test";
import App from "./App";
import { db, openDatabaseForScope, threads, messages } from "@/lib/db";
import { deleteTree } from "betterbase/sync";

interface Wipeable {
  query(c: never, o: unknown): Promise<{ records: Array<{ id: string }> }>;
  delete(c: never, id: string): Promise<unknown>;
}

/** Leave the module in the anonymous state, cleaned, for other test files.
 * Threads are deleted with their cascade; orphaned messages (if a test was
 * interrupted mid-cascade) are swept individually. */
async function wipeAnonymous() {
  await openDatabaseForScope(null);
  const current = db as unknown as Wipeable;
  const allThreads = await current.query(threads as never, {});
  for (const t of allThreads.records) {
    await deleteTree(db, threads as never, t.id);
  }
  const orphans = await current.query(messages as never, {});
  await Promise.all(orphans.records.map((m) => current.delete(messages as never, m.id)));
}

/**
 * The model and inference boundaries are stubbed: real inference needs
 * WebGPU and a ~760 MB download, which has no place in a unit test. The
 * database is real (OPFS-backed, same as production) and wiped between
 * tests. These tests pin the UI lifecycle (gate → load → progress →
 * workspace), the thread/chat flow through the db, and the failure/retry
 * paths.
 */
const harness = vi.hoisted(() => ({
  progress: null as null | ((progress: number) => void),
  resolveLoad: null as null | (() => void),
  rejectLoad: null as null | ((error: Error) => void),
  dispose: vi.fn(),
  reply: "Four.",
  reasoning: "2 plus 2 is 4.",
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
  MODEL_LABEL: "LFM2.5 1.2B Thinking",
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

vi.mock("@/lib/chat-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat-service")>();
  return {
    ...actual,
    // Inference stub: streams the configured reply/reasoning in two steps.
    streamReply: vi.fn(
      async (
        _model: unknown,
        _history: unknown,
        options: { onUpdate: (state: { reasoning: string; text: string }) => void },
      ) => {
        options.onUpdate({ reasoning: harness.reasoning, text: "" });
        options.onUpdate({ reasoning: harness.reasoning, text: harness.reply });
        return { state: { reasoning: harness.reasoning, text: harness.reply }, error: null };
      },
    ),
    generateThreadTitle: vi.fn(async () => "Math Question"),
  };
});

/** Drives the app from the load screen to the ready workspace. */
async function loadModelThroughUi() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /download .* model/i }));
  await act(async () => {
    harness.progress?.(1);
    harness.resolveLoad?.();
  });
  return user;
}

beforeEach(() => {
  stubWebGpu(true);
  harness.progress = null;
  harness.resolveLoad = null;
  harness.rejectLoad = null;
  harness.dispose.mockReset();
});

afterEach(async () => {
  if (originalGpu) Object.defineProperty(navigator, "gpu", originalGpu);
  else delete (navigator as { gpu?: unknown }).gpu;
  await wipeAnonymous().catch(() => undefined);
});

describe("AI Chat app", () => {
  it("blocks with a WebGPU requirement when the browser can't run the model", async () => {
    stubWebGpu(false);
    renderWithProviders(<App />);

    expect(await screen.findByText(/webgpu required/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /download/i })).toBeNull();
  });

  it("shows download progress while the model loads, then the workspace", async () => {
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
    // Signed-out empty state: chats live in the local database.
    expect(await screen.findByText(/no chats yet/i)).toBeVisible();
  });

  it("runs a full exchange: send, stream, reason, and title the thread", async () => {
    renderWithProviders(<App />);
    await loadModelThroughUi();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /new chat/i }));

    const input = await screen.findByLabelText("Message");
    await user.type(input, "What is 2 + 2?");
    await user.keyboard("{Enter}");

    // The reply (markdown-rendered) and the user message both appear.
    // Re-query inside waitFor: streaming updates re-render the message
    // nodes, which can detach a node captured between updates.
    await waitFor(() => {
      const log = screen.getByRole("log");
      expect(within(log).getByText("Four.")).toBeVisible();
      expect(within(log).getByText("What is 2 + 2?")).toBeVisible();
    });

    // The thinking trace collapses behind its toggle (present but hidden).
    expect(screen.getByText(harness.reasoning)).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: /show thinking/i }));
    await waitFor(() => expect(screen.getByText(harness.reasoning)).toBeVisible());

    // The model named the thread (sidebar shows it, not "New chat").
    expect(await screen.findByText("Math Question")).toBeVisible();
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
    const { streamReply } = await import("@/lib/chat-service");
    vi.mocked(streamReply).mockResolvedValueOnce({
      state: { reasoning: "", text: "" },
      error: new Error("WebGPU device lost"),
    });

    renderWithProviders(<App />);
    await loadModelThroughUi();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /new chat/i }));
    await user.type(await screen.findByLabelText("Message"), "hello");
    await user.keyboard("{Enter}");

    expect(await screen.findByText(/webgpu device lost/i)).toBeVisible();
  });

  it("deletes a thread from the sidebar", async () => {
    renderWithProviders(<App />);
    await loadModelThroughUi();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /new chat/i }));
    await user.type(await screen.findByLabelText("Message"), "hi");
    await user.keyboard("{Enter}");
    await screen.findByText("Four.");

    await user.click(screen.getByRole("button", { name: /delete chat/i }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/no chats yet/i)).toBeVisible();
    // The cascade is real: the thread's message records must be gone too,
    // not just the thread (orphaned messages would keep syncing forever).
    const remaining = await (db as unknown as Wipeable).query(messages as never, {});
    expect(remaining.records).toHaveLength(0);
  });

  it("renames a thread from the sidebar", async () => {
    renderWithProviders(<App />);
    await loadModelThroughUi();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /new chat/i }));
    await user.type(await screen.findByLabelText("Message"), "hi");
    await user.keyboard("{Enter}");
    await screen.findByText("Four.");

    await user.click(screen.getByRole("button", { name: /rename chat/i }));
    const modal = await screen.findByRole("dialog");
    const field = within(modal).getByRole("textbox");
    await user.clear(field);
    await user.type(field, "My renamed chat{Enter}");

    expect(await screen.findByText("My renamed chat")).toBeVisible();
  });
});
