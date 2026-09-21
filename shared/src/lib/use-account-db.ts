import { useEffect, useState } from "react";

/**
 * Opens the account-scoped database before the app renders its consumers
 * (AUD-045). Returns `{ ready, key, error }`: `ready` flips once the
 * database for the CURRENT scope is open; `key` changes whenever the scope
 * does, and is meant as a React key so the whole authenticated/local tree
 * remounts against the swapped database (the ES-module `db` binding is
 * live, so post-remount readers see the new instance). `error` is set when
 * the open itself failed (OPFS timeout, quota) — surface it via
 * DbScopeGate rather than showing a loader forever.
 */
export function useDbScope(
  openForScope: (scopeKey: string | null) => Promise<void>,
  scopeKey: string | null,
): { ready: boolean; key: string; error: unknown } {
  const key = scopeKey ?? "anonymous";
  const [state, setState] = useState<{
    scope: string | null;
    error: unknown;
  }>({ scope: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, error: null }));
    openForScope(scopeKey)
      .then(() => {
        if (!cancelled) setState({ scope: key, error: null });
      })
      .catch((err) => {
        console.error("Failed to open account database", err);
        if (!cancelled) setState((prev) => ({ ...prev, error: err }));
      });
    return () => {
      cancelled = true;
    };
  }, [openForScope, scopeKey, key]);

  return { ready: state.scope === key, key, error: state.error };
}
