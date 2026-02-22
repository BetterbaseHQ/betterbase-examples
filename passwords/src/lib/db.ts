import { createOpfsDb, type CollectionRead } from "@betterbase/sdk/db";
import { entries } from "./collections.js";

export { entries } from "./collections.js";

export type Entry = CollectionRead<typeof entries>;

export const db = await createOpfsDb("less-passwords", [entries], {
  worker: new Worker(new URL("./db-worker.ts", import.meta.url), {
    type: "module",
  }),
});
