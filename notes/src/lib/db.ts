import { createOpfsDb, type CollectionRead } from "@betterbase/sdk/db";
import { notebooks, notes } from "./collections.js";

export { notebooks, notes } from "./collections.js";

export type Notebook = CollectionRead<typeof notebooks>;
export type Note = CollectionRead<typeof notes>;

export const db = await createOpfsDb("less-notes", [notebooks, notes], {
  worker: new Worker(new URL("./db-worker.ts", import.meta.url), {
    type: "module",
  }),
});
