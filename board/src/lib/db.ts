import { createDatabase, type CollectionRead } from "betterbase/db";
import { accountDbName } from "@betterbase/examples-shared";
import { boards, columns, cards } from "./collections.js";

export { boards, columns, cards } from "./collections.js";

export type Board = CollectionRead<typeof boards>;
export type Column = CollectionRead<typeof columns>;
export type Card = CollectionRead<typeof cards>;

/**
 * App database — a live binding swapped by `openDatabaseForScope`.
 *
 * The bare name is the anonymous/local namespace (retained deliberately:
 * offline-first data is never deleted on account switch). Each signed-in
 * account gets `name::<scope-hash>` so one account's decrypted records are
 * never visible to another account or to the unauthenticated view
 * (AUD-045). The App root remounts (React key) whenever the scope swaps,
 * so no component observes a database mid-swap.
 *
 * Caveat: importers must use `db` directly (live binding) — capturing it
 * (`const d = db`) pins one scope's instance past a swap.
 */
export const DB_NAME = "board";

let openName = DB_NAME;

export let db = await createDatabase(DB_NAME, [boards, columns, cards], {
  worker: new Worker(new URL("./db-worker.ts", import.meta.url), {
    type: "module",
  }),
});

/** Type of the swapped binding (queries/puts go through it). */
export type AppDb = typeof db;

/**
 * Open the database for the given account scope (null = anonymous). No-op
 * when that database is already open. Swaps the live `db` binding on
 * success; callers remount afterwards.
 */
export async function openDatabaseForScope(scopeKey: string | null): Promise<void> {
  const name = scopeKey === null ? DB_NAME : await accountDbName(DB_NAME, scopeKey);
  if (name === openName) return;
  const next = await createDatabase(name, [boards, columns, cards], {
    worker: new Worker(new URL("./db-worker.ts", import.meta.url), {
      type: "module",
    }),
  });
  db = next;
  openName = name;
}
