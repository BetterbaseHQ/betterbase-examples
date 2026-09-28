import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ModelInfo } from "@/lib/model";
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
 * WebGPU and a multi-GB download, which has no place in a unit test. The
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
  /** ids handed to createChatModel, in order */
  created: [] as string[],
  reply: "Four.",
  reasoning: "2 plus 2 is 4.",
  ready: { "1.2b": false, "2.6b": false } as Record<string, boolean>,
  selected: "1.2b",
  /** every selection the app persisted, in order */
  selectCalls: [] as string[],
  /** ids whose cache was cleared from the picker */
  cleared: [] as string[],
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

vi.mock("@/lib/model", () => {
  const MODELS: ModelInfo[] = [
    {
      id: "1.2b",
      repo: "stub/1.2b",
      dtype: "q4f16",
      label: "LFM2.5 1.2B Instruct",
      approxSize: "~700 MB",
      blurb: "Fast everyday model — chat, writing, and simple tools",
    },
    {
      id: "2.6b",
      repo: "stub/2.6b",
      dtype: "q4f16",
      label: "LFM2.5 2.6B",
      approxSize: "~1.6 GB",
      blurb: "More capable — better for longer tasks and tool use",
    },
  ];
  return {
    MODELS,
    getModel: (id: string) => MODELS.find((m) => m.id === id) ?? MODELS[0]!,
    selectedModelId: () => harness.selected,
    setSelectedModelId: (id: string) => {
      harness.selected = id;
      harness.selectCalls.push(id);
    },
    isModelReady: (id: string) => harness.ready[id] ?? false,
    markModelReady: (id: string) => {
      harness.ready[id] = true;
    },
    clearModelReady: (id: string) => {
      harness.ready[id] = false;
    },
    clearModelCache: (info: { id: string }) => {
      harness.cleared.push(info.id);
      harness.ready[info.id] = false;
    },
    createChatModel: (info: { id: string }) => {
      harness.created.push(info.id);
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
  };
});

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
  harness.ready = { "1.2b": false, "2.6b": false };
  harness.selected = "1.2b";
  harness.selectCalls = [];
  harness.created = [];
  harness.cleared = [];
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
    // The workspace opens on the New chat draft (chats live in the db).
    expect(await screen.findByText(/how can i help you today\?/i)).toBeVisible();
  });

  it("opens on the New chat draft and creates the thread on first send", async () => {
    // Gate title generation so the provisional (truncated) title can be
    // observed before the model's title replaces it.
    const { generateThreadTitle } = await import("@/lib/chat-service");
    let releaseTitle: () => void = () => undefined;
    const titleGated = new Promise<void>((resolve) => {
      releaseTitle = resolve;
    });
    vi.mocked(generateThreadTitle).mockImplementationOnce(async () => {
      await titleGated;
      return "Math Question";
    });

    renderWithProviders(<App />);
    await loadModelThroughUi();

    // The app opens on the persistent New chat item, not on a thread.
    const newChat = screen.getByRole("button", { name: "Start a new chat" });
    expect(newChat).toHaveAttribute("aria-current", "true");
    expect(await screen.findByText(/how can i help you today\?/i)).toBeVisible();

    const user = userEvent.setup();
    try {
      // First send from the draft: the thread comes into existence titled
      // with the truncated opening message.
      await user.type(await screen.findByLabelText("Message"), "What is 2 + 2?");
      await user.keyboard("{Enter}");
      await screen.findByText("Four.");

      const nav = screen.getByRole("navigation");
      expect(await within(nav).findByText("What is 2 + 2?")).toBeVisible();
      expect(within(nav).getByRole("button", { name: "Start a new chat" })).not.toHaveAttribute(
        "aria-current",
      );
      expect(await within(nav).findByText("Four.")).toBeVisible();

      // Only when the model names the thread does the title swap.
      releaseTitle();
      expect(await within(nav).findByText("Math Question")).toBeVisible();
      expect(within(nav).queryByText("What is 2 + 2?")).toBeNull();

      // A second send continues the same thread — the draft is gone.
      await user.type(await screen.findByLabelText("Message"), "and 3 + 3?");
      await user.keyboard("{Enter}");
      await waitFor(() =>
        expect(within(screen.getByRole("log")).getAllByText("Four.")).toHaveLength(2),
      );
    } finally {
      // Never leave the gated title implementation for the next test.
      releaseTitle();
    }

    // Exactly one thread exists, and selecting New chat again created no
    // further threads.
    await user.click(screen.getByRole("button", { name: "Start a new chat" }));
    await screen.findByText(/how can i help you today\?/i);
    const all = await (db as unknown as Wipeable).query(threads as never, {});
    expect(all.records).toHaveLength(1);
  });

  it("shows the draft send immediately: message, stop control, provisional title", async () => {
    // Gate the stream so the in-flight state can be observed — this pins
    // that selecting the thread does not wait for the reply to finish.
    const { streamReply } = await import("@/lib/chat-service");
    let releaseStream: () => void = () => undefined;
    const streamGated = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    vi.mocked(streamReply).mockImplementationOnce(async (_model, _history, options) => {
      options.onUpdate({ reasoning: "", text: "" });
      await streamGated;
      options.onUpdate({ reasoning: harness.reasoning, text: harness.reply });
      return { state: { reasoning: harness.reasoning, text: harness.reply }, error: null };
    });

    renderWithProviders(<App />);
    await loadModelThroughUi();

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Message"), "What is 2 + 2?");
    await user.keyboard("{Enter}");

    // While the model runs: the send is visible, cancellable, and the
    // thread exists with its provisional title. Re-query inside waitFor:
    // db-driven re-renders detach nodes between query and assertion.
    await waitFor(() => {
      expect(within(screen.getByRole("log")).getByText("What is 2 + 2?")).toBeVisible();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /stop generating/i })).toBeVisible();
    });
    await waitFor(() => {
      expect(within(screen.getByRole("navigation")).getByText("What is 2 + 2?")).toBeVisible();
    });

    releaseStream();
    await waitFor(() => {
      expect(within(screen.getByRole("log")).getByText("Four.")).toBeVisible();
    });
  });

  it("runs a full exchange: send, stream, reason, and title the thread", async () => {
    renderWithProviders(<App />);
    await loadModelThroughUi();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Start a new chat" }));

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

  it("switches models from the picker and loads the pick", async () => {
    renderWithProviders(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: /LFM2\.5 2\.6B/ }));
    expect(screen.getByRole("button", { name: /download ~1\.6 gb model/i })).toBeVisible();
    expect(harness.selected).toBe("2.6b");

    await user.click(screen.getByRole("button", { name: /download ~1\.6 gb model/i }));
    await act(async () => {
      harness.progress?.(1);
      harness.resolveLoad?.();
    });

    expect(await screen.findByLabelText("Message")).toBeVisible();
    expect(harness.created).toEqual(["2.6b"]);
  });

  it("returns to the picker via Change model and loads a different model", async () => {
    renderWithProviders(<App />);
    const user = await loadModelThroughUi();
    expect(harness.created).toEqual(["1.2b"]);
    const firstDispose = harness.dispose;

    await user.click(screen.getByRole("button", { name: "Change model" }));
    // The 1.2B is already cached, so the picker offers a load, not a download.
    expect(await screen.findByRole("button", { name: "Load model" })).toBeVisible();
    expect(screen.getByText("Already downloaded — loads straight from your cache")).toBeVisible();

    await user.click(screen.getByRole("radio", { name: /LFM2\.5 2\.6B/ }));
    await user.click(screen.getByRole("button", { name: /download ~1\.6 gb model/i }));
    await act(async () => {
      harness.progress?.(1);
      harness.resolveLoad?.();
    });

    expect(await screen.findByLabelText("Message")).toBeVisible();
    expect(harness.created).toEqual(["1.2b", "2.6b"]);
    expect(firstDispose).toHaveBeenCalled();
  });

  it("marks cached models in the picker and deletes their weights on demand", async () => {
    renderWithProviders(<App />);
    const user = await loadModelThroughUi();
    await user.click(screen.getByRole("button", { name: "Change model" }));

    // Exactly one Cached badge: the loaded 1.2B, not the 2.6B.
    expect(screen.getAllByText("Cached")).toHaveLength(1);

    await user.click(
      screen.getByRole("button", { name: "Delete downloaded LFM2.5 1.2B Instruct" }),
    );
    await waitFor(() => expect(harness.cleared).toEqual(["1.2b"]));

    // Chip gone, and the pitch is honest again: this is a download.
    expect(screen.queryByText("Cached")).toBeNull();
    expect(screen.getByRole("button", { name: /download ~700 mb model/i })).toBeVisible();
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
    await user.click(await screen.findByRole("button", { name: "Start a new chat" }));
    await user.type(await screen.findByLabelText("Message"), "hello");
    await user.keyboard("{Enter}");

    expect(await screen.findByText(/webgpu device lost/i)).toBeVisible();
  });

  it("deletes a thread from the sidebar", async () => {
    renderWithProviders(<App />);
    await loadModelThroughUi();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Start a new chat" }));
    await user.type(await screen.findByLabelText("Message"), "hi");
    await user.keyboard("{Enter}");
    await screen.findByText("Four.");

    await user.click(screen.getByRole("button", { name: /chat options/i }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    // Deleting the active thread lands back on the New chat draft.
    expect(await screen.findByText(/how can i help you today\?/i)).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start a new chat" })).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
    // The cascade is real: the thread's message records must be gone too,
    // not just the thread (orphaned messages would keep syncing forever).
    const remaining = await (db as unknown as Wipeable).query(messages as never, {});
    expect(remaining.records).toHaveLength(0);
  });

  it("auto-loads the model for returning users without the download pitch", async () => {
    harness.ready["1.2b"] = true;
    renderWithProviders(<App />);

    // The consent button never appears; the load starts on its own. The
    // cached card's delete action doesn't count as a download pitch.
    expect(screen.queryByRole("button", { name: /download (~|model)/i })).toBeNull();
    expect(await screen.findByText(/loading model/i)).toBeVisible();

    await act(async () => {
      harness.progress?.(1);
      harness.resolveLoad?.();
    });
    expect(await screen.findByText(/how can i help you today\?/i)).toBeVisible();
  });

  it("clears the auto-load flag when the warm load fails and offers retry", async () => {
    harness.ready["1.2b"] = true;
    renderWithProviders(<App />);

    await act(async () => {
      harness.rejectLoad?.(new Error("warm boot failed"));
    });

    expect(await screen.findByText(/couldn't load the model/i)).toBeVisible();
    expect(screen.getByText("warm boot failed")).toBeVisible();
    expect(screen.getByRole("button", { name: /retry download/i })).toBeVisible();
    expect(harness.ready["1.2b"]).toBe(false);
  });

  it("recovers to the workspace when the retried warm load succeeds", async () => {
    harness.ready["1.2b"] = true;
    renderWithProviders(<App />);

    await act(async () => {
      harness.rejectLoad?.(new Error("warm boot failed"));
    });
    await screen.findByText(/couldn't load the model/i);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry download/i }));
    await act(async () => {
      harness.progress?.(1);
      harness.resolveLoad?.();
    });
    expect(await screen.findByText(/how can i help you today\?/i)).toBeVisible();
  });

  it("sends a suggestion chip straight into the chat", async () => {
    renderWithProviders(<App />);
    await loadModelThroughUi();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Start a new chat" }));
    expect(await screen.findByText(/how can i help you today\?/i)).toBeVisible();

    await user.click(await screen.findByRole("button", { name: /explain a concept/i }));

    // The chip's prompt becomes the user turn; the reply streams after it.
    await waitFor(() => {
      const log = screen.getByRole("log");
      expect(within(log).getByText(/HTTPS keeps traffic private/)).toBeVisible();
      expect(within(log).getByText("Four.")).toBeVisible();
    });
  });

  it("renames a thread from the sidebar", async () => {
    renderWithProviders(<App />);
    await loadModelThroughUi();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Start a new chat" }));
    await user.type(await screen.findByLabelText("Message"), "hi");
    await user.keyboard("{Enter}");
    await screen.findByText("Four.");

    await user.click(screen.getByRole("button", { name: /chat options/i }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    const modal = await screen.findByRole("dialog");
    const field = within(modal).getByRole("textbox");
    await user.clear(field);
    await user.type(field, "My renamed chat{Enter}");

    expect(await screen.findByText("My renamed chat")).toBeVisible();
  });
});
