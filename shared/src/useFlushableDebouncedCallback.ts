import { useCallback, useEffect, useRef } from "react";

/**
 * Debounced callback with a safe `flush()`.
 *
 * Unlike Mantine's `useDebouncedCallback`, whose `flush()` only zeroes the
 * timer ref without cancelling the pending `setTimeout`, this hook's
 * `flush()` cancels the timer and fires the pending arguments exactly once.
 * The Mantine behavior lets a stale timeout re-fire *old* arguments after a
 * forced flush if another call has since re-armed the timer ref — silently
 * swallowing the newest save (observed while fixing AUD-046: a draft
 * flushed on peer-update was followed by a keystroke whose save never
 * landed).
 */
export function useFlushableDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  options: { delay: number; flushOnUnmount?: boolean },
) {
  const { delay, flushOnUnmount = false } = options;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgs = useRef<A | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const fire = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const args = pendingArgs.current;
    pendingArgs.current = null;
    if (args !== null) callbackRef.current(...args);
  }, []);

  const schedule = useCallback(
    (...args: A) => {
      pendingArgs.current = args;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(fire, delay);
    },
    [delay, fire],
  );

  useEffect(
    () => () => {
      if (flushOnUnmount) fire();
      else if (timer.current !== null) clearTimeout(timer.current);
    },
    [fire, flushOnUnmount],
  );

  return Object.assign(schedule, { flush: fire });
}
