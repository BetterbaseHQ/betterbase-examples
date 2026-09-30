/**
 * Returns just the username portion of a handle (e.g. "slim" from "slim@localhost:5377"),
 * unless another handle in the set has the same username — in which case the full
 * handle is returned to disambiguate.
 */
export function shortHandle(handle: string, allHandles: readonly string[]): string {
  const at = handle.lastIndexOf("@");
  if (at < 0) return handle;
  const username = handle.slice(0, at);
  const hasDupe = allHandles.some(
    (h) => h !== handle && h.slice(0, h.lastIndexOf("@")) === username,
  );
  return hasDupe ? handle : username;
}
