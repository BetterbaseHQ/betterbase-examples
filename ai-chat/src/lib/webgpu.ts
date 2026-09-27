/**
 * WebGPU capability check, kept in its own module so UI code and tests can
 * use it without pulling in the Transformers.js/ONNX runtime.
 */
export function isWebGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && Boolean(navigator.gpu);
}
