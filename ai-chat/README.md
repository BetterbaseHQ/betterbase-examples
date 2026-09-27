# AI Chat — a local LLM in the browser

A chat app where the model runs **entirely on the device**. There is no
inference server, no API key, and no account: the browser downloads an ONNX
build of Liquid AI's [LFM2.5-1.2B-Instruct](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-ONNX)
once, runs it on WebGPU via [Transformers.js](https://huggingface.co/docs/transformers.js),
and streams tokens back through the Vercel AI SDK. Runs on port 5386
(`pnpm dev`).

This is the odd one out in the examples suite: it demonstrates the _local_
half of local-first — compute that never leaves the device — rather than sync
and encryption.

## Model lifecycle

`src/App.tsx` has three states: **idle → loading → ready**.

- **Idle** (`ModelSetup`): explains the download and offers a button. Nothing
  is fetched until the user asks for it.
- **Loading**: `createChatModel()` builds the provider and `loadModel()` forces
  the otherwise-lazy initialization. The progress bar tracks the weight
  download.
- **Ready** (`ChatPanel`): the chat UI.

`LiquidAI/LFM2.5-1.2B-Instruct-ONNX` at `q4f16` is ~760 MB. It downloads once
and is then served from the browser's Cache Storage — a warm profile goes
straight to 100%. WebGPU is required; without it the app shows a
"WebGPU required" screen instead of a degraded mode (`src/lib/webgpu.ts`).

## How the AI SDK is wired

`LocalChatTransport` (`src/lib/chat-transport.ts`) implements the AI SDK's
`ChatTransport` interface without any HTTP. `sendMessages()` calls
`streamText()` directly on the Transformers.js model and re-encodes its stream
with `toUIMessageStream()`, so `useChat()` sees exactly the same streaming
chunks it would from a server endpoint. `reconnectToStream()` returns `null` —
there is no server-side stream to reattach to.

## Why inference runs in a worker

`src/lib/model-worker.ts` wraps `TransformersJSWorkerHandler`, and the app
constructs the `Worker` itself (`createChatModel`). Owning the worker lets the
app terminate it: `createChatModel` returns a handle whose `dispose()` kills the
worker, so a failed load's worker (and its partial download) is released before
a retry starts, and on unmount.

Loading is explicit. `loadModel()` calls the provider's
`createSessionWithProgress()`, the public way to force the otherwise-lazy
initialization; it reports aggregate download progress (0..1) to the callback
that drives the progress bar, and resolves once the worker is ready.

## Files

| File                            | Role                                                     |
| ------------------------------- | -------------------------------------------------------- |
| `src/lib/model.ts`              | Model constants, worker wiring + disposal, `loadModel()` |
| `src/lib/model-worker.ts`       | Worker entry point (off the main thread)                 |
| `src/lib/chat-transport.ts`     | AI SDK `ChatTransport` over local `streamText()`         |
| `src/lib/webgpu.ts`             | WebGPU capability check                                  |
| `src/components/ModelSetup.tsx` | Idle/loading screens + WebGPU gate                       |
| `src/components/ChatPanel.tsx`  | Streaming chat UI                                        |

## Tests

`pnpm test` runs the vitest browser suite. The model and transport are mocked
(`@/lib/model`, `@/lib/chat-transport`) so tests never touch WebGPU or the
network; the WebGPU gate is exercised against a stubbed `navigator.gpu`.

## Verifying real inference

Unit tests mock the model, so a full check should also exercise the real one
once:

```bash
pnpm build
pnpm exec vite preview --port 5390 --strictPort
```

Serve it on a `localhost` origin (WebGPU is only exposed in a secure
context — `about:blank` and plain non-loopback HTTP report no `navigator.gpu`)
and use a hardware WebGPU adapter: Playwright's bundled Chromium works
_headed_ (Metal), while headless needs `--enable-unsafe-webgpu` and then only
gets the SwiftShader adapter, which lacks `shader-f16` and can't load the
q4f16 weights. Load the model, and ask a question. A cold profile
downloads ~760 MB; a warm one skips straight to ready. Inference works signed
out — the header's auth controls exist only so the app matches the suite.
