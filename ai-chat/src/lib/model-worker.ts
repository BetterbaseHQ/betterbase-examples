import { TransformersJSWorkerHandler } from "@browser-ai/transformers-js";

// Runs Transformers.js off the main thread — model download, WebGPU setup and
// token generation all happen here, so the chat UI stays responsive.
const handler = new TransformersJSWorkerHandler();

self.onmessage = (event: MessageEvent) => {
  handler.onmessage(event);
};
