import { createDatabase, type CollectionRead } from "betterbase/db";
import { entries } from "./collections.js";

export { entries } from "./collections.js";

export type Entry = CollectionRead<typeof entries>;

export const db = await createDatabase("passwords", [entries], {
  worker: new Worker(new URL("./db-worker.ts", import.meta.url), {
    type: "module",
  }),
});
