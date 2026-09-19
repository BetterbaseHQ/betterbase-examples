/**
 * Clipboard helper for secrets: copies like navigator.clipboard.writeText but
 * clears the clipboard after a delay so the secret doesn't linger for other
 * apps. A subsequent copy cancels the pending clear.
 */

let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** Cancel a pending auto-clear (call when copying something that isn't a secret). */
export function cancelPendingClear(): void {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
}

export async function copySecret(value: string, clearAfterMs = 30_000): Promise<void> {
  await navigator.clipboard.writeText(value);
  cancelPendingClear();
  clearTimer = setTimeout(() => {
    clearTimer = null;
    // Clearing can fail if the document lost focus; best-effort only.
    navigator.clipboard.writeText("").catch(() => {});
  }, clearAfterMs);
}
