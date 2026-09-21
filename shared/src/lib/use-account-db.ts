import { useEffect, useState } from "react";

/**
 * Opens the account-scoped database before the app renders its consumers
 * (AUD-045). Returns `{ ready, key }`: `ready` flips once the database for
 * the CURRENT scope is open; `key` changes whenever the scope does, and is
 * meant as a React key so the whole authenticated/local tree remounts
 * against the swapped database (the ES-module `db` binding is live, so
 * post-remount readers see the new instance).
 */
export function useDbScope(
  openForScope: (scopeKey: string | null) => Promise<void>,
  scopeKey: string | null,
): { ready: boolean; key: string } {
  const key = scopeKey ?? "anonymous";
  const [readyScope, setReadyScope] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    openForScope(scopeKey)
      .then(() => {
        if (!cancelled) setReadyScope(key);
      })
      .catch((err) => {
        console.error("Failed to open account database", err);
      });
    return () => {
      cancelled = true;
    };
  }, [openForScope, scopeKey, key]);

  return { ready: readyScope === key, key };
}
