import { useState, useEffect, useRef, useCallback } from "react";
import { useEvent, useSendEvent } from "betterbase/sync/react";

const SEND_INTERVAL = 2000; // suppress duplicate sends within 2s
const RECEIVE_TIMEOUT = 3000; // expire peer after 3s of silence

interface TypingPayload {
  handle: string;
}

type TypingEventMap = { typing: TypingPayload };

/**
 * Typing broadcast/receive hook.
 *
 * Call `sendTyping()` on every keystroke — it debounces internally (1 event per 2s).
 * `typingPeers` contains handles of currently-typing peers (auto-expires after 3s).
 */
export function useTyping(
  spaceId: string | undefined,
  myHandle: string | null,
): {
  typingPeers: string[];
  sendTyping: () => void;
} {
  const [typingPeers, setTypingPeers] = useState<string[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastSent = useRef(0);

  const send = useSendEvent<TypingEventMap>(spaceId);

  // Receive typing events from other peers
  useEvent<TypingEventMap, "typing">(spaceId, "typing", (data) => {
    // Ignore own echoes
    if (data.handle === myHandle) return;

    const handle = data.handle;

    // Clear existing timer for this handle
    const existing = timers.current.get(handle);
    if (existing) clearTimeout(existing);

    // Add to typing set
    setTypingPeers((prev) => (prev.includes(handle) ? prev : [...prev, handle]));

    // Set expiry timer
    timers.current.set(
      handle,
      setTimeout(() => {
        timers.current.delete(handle);
        setTypingPeers((prev) => prev.filter((h) => h !== handle));
      }, RECEIVE_TIMEOUT),
    );
  });

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      for (const t of timers.current.values()) clearTimeout(t);
      timers.current.clear();
    };
  }, []);

  const sendTyping = useCallback(() => {
    if (!myHandle || !send) return;
    const now = Date.now();
    if (now - lastSent.current < SEND_INTERVAL) return;
    lastSent.current = now;
    send("typing", { handle: myHandle });
  }, [myHandle, send]);

  return { typingPeers, sendTyping };
}
