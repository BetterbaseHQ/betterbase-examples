/**
 * Clipboard helper for secrets: copies like navigator.clipboard.writeText but
 * clears the clipboard after a delay so the secret doesn't linger for other
 * apps. A subsequent copy cancels the pending clear.
 */

let clearTimer: ReturnType<typeof setTimeout> | null = null;

export async function copySecret(value: string, clearAfterMs = 30_000): Promise<void> {
  await navigator.clipboard.writeText(value);
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    clearTimer = null;
    // Clearing can fail if the document lost focus; best-effort only.
    navigator.clipboard.writeText("").catch(() => {});
  }, clearAfterMs);
}
