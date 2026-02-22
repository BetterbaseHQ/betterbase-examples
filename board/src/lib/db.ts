import { createOpfsDb, type CollectionRead } from "@betterbase/sdk/db";
import { boards, cards } from "./collections.js";

export { boards, cards } from "./collections.js";

export type Board = CollectionRead<typeof boards>;
export type Card = CollectionRead<typeof cards>;

export const db = await createOpfsDb("less-board", [boards, cards], {
  worker: new Worker(new URL("./db-worker.ts", import.meta.url), {
    type: "module",
  }),
});
