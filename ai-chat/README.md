# AI Chat — a local LLM in the browser

A chat app where the model runs **entirely on the device**. There is no
inference server and no API key: the browser downloads an ONNX build of one
of three Liquid AI models once, runs it on WebGPU via
[Transformers.js](https://huggingface.co/docs/transformers.js), and streams
tokens back through the Vercel AI SDK. Chats live in the local betterbase
database and sync end-to-end encrypted across your devices. Runs on port
5386 (`pnpm dev`).

It demonstrates both halves of local-first at once: **compute that never
leaves the device** and **data that syncs without a server seeing it**.

## Features

- **Model picker** — three tiers, chosen on first run and switchable from
  the sidebar anytime; each model caches independently and the pick is
  remembered.
- **Thread sidebar** — list, rename, delete; newest first. Threads are
  auto-named by the model itself after the first exchange (with a
  truncation fallback).
- **Thinking trace** — the 2.6B reasons inside `<think>…</think>` (its chat
  template prefills the opening tag); the AI SDK's
  `extractReasoningMiddleware` splits that out of the stream, so reasoning
  streams into its own field and collapses behind a "Show thinking" toggle.
- **Markdown replies** — GFM tables, lists, fenced code blocks with a
  language label and copy button. Rendered as React nodes (no raw HTML),
  so model output has no script-injection surface.
- **Message actions** — copy, edit & regenerate a user message, regenerate
  a reply, stop mid-stream.
- **Synced history** — works fully offline and signed out (anonymous local
  database); signing in adopts that history into the account database and
  syncs it E2EE. Sync is per-record, so streaming a reply costs one small
  blob, not the whole thread.

## Model lifecycle

`src/App.tsx` has two phases: **model gate** (picker → loading → ready) and
**workspace**.

- **Picker** (`ModelSetup`): a card per model — label, one-liner, download
  size, and a "Downloaded" chip when the weights are already on disk. Downloaded
  models offer a load (not a download) and a trash action that deletes
  their weights from the browser cache. Nothing is fetched until the user
  asks for it.
- **Loading**: `createChatModel()` builds the provider and `loadModel()` forces
  the otherwise-lazy initialization. The progress bar tracks the weight
  download. A worker that fails before posting anything (script-load failure,
  CSP block) is bridged into the load path so it can't hang forever. A failed
  load clears that model's cache flag and returns to a clean retry state.
- **Ready**: the workspace mounts and the worker stays warm across thread
  switches and account swaps — only the UI re-mounts. "Change model" in the
  sidebar disposes the worker and returns to the picker (auto-start stays off
  so the loaded model doesn't silently re-load).

The registry (`src/lib/model.ts`):

| Model                          | Weights                                               | Notes                                 |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------- |
| LFM2.5 1.2B Instruct (default) | ~700 MB, `LiquidAI/LFM2.5-1.2B-Instruct-ONNX`         | non-thinking; fast titles             |
| LFM2.5 2.6B                    | ~1.6 GB, `LiquidAI/LFM2.5-2.6B-ONNX`                  | thinking; template prefills `<think>` |
| LFM2.5 8B A1B                  | ~5 GB, `nchapman/LFM2.5-8B-A1B-ONNX-q4f16-sym-webgpu` | MoE flagship; needs ~6 GB GPU memory  |

The 8B entry points at a re-hosted export because browsers cannot run the
official one: its 2.15 GB external-data shards exceed V8's ArrayBuffer limit,
and its QMoE nodes carry zero_points that onnxruntime-web's WebGPU kernel
rejects. The hosted repo fixes the Transformers.js chunk-count config and
uses a symmetric (zero_points-free) re-quantization in ≤900 MB shards.

Each model's weights download once and are then served from the browser's
cache — a warm profile goes straight to 100%. Readiness is tracked per model
(`ai-chat:model-ready:<id>`) and the pick persists (`ai-chat:model`).
WebGPU is required; without it the app shows a "WebGPU required" screen
instead of a degraded mode (`src/lib/webgpu.ts`).

## How the pieces fit

- **`src/lib/collections.ts`** — `threads` and `messages` collections.
  Messages are separate records (not embedded in the thread) with a declared
  parent edge: concurrent appends from two devices both survive the CRDT
  merge, each record syncs as its own small encrypted blob, and deleting a
  thread cascades its messages. The assistant's reasoning is its own
  `reasoning` field (`t.text`), separate from the answer.
- **`src/lib/db.ts`** — the scoped-database pattern shared with the other
  examples: anonymous namespace by default, per-account namespace on sign-in,
  with anonymous → account adoption handled by `createScopedAppDb`.
- **`src/lib/use-ai-chat.ts`** — the domain hook: queries, thread CRUD, and
  one assistant turn (stream into the placeholder message record, throttled
  db writes, final authoritative write, then title generation).
- **`src/lib/chat-service.ts`** — wraps the Transformers.js model in
  `extractReasoningMiddleware({ tagName: "think" })` (with
  `startWithReasoning` for the 2.6B's prefilled think tag) and exposes
  `streamReply` / `generateThreadTitle`.
- **`src/lib/runtime.ts`** — feeds the db-backed state into
  [assistant-ui](https://www.assistant-ui.com/) as an external store; its
  primitives drive the message list and composer while Mantine renders.
- **`src/components/`** — `ThreadSidebar`, `ChatThread` (messages, reasoning
  panel, composer), `Markdown`.

## Why inference runs in a worker

`@browser-ai/transformers-js` runs the model in a Web Worker so downloads
and token generation never block the UI thread — and the app owns that
worker, so it can terminate it (`createChatModel`'s `dispose`) on retry and
unmount.

## E2E coverage

This app is excluded from the Playwright examples suite: the q4f16 models
need a hardware WebGPU adapter with `shader-f16`, and headless CI only gets
SwiftShader without it. Unit/browser tests + manual verification cover the
app instead; see `../e2e/playwright.config.ts` for the rationale.
