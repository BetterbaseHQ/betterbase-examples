import { createDatabase, type CollectionRead } from "betterbase/db";
import { boards, columns, cards } from "./collections.js";

export { boards, columns, cards } from "./collections.js";

export type Board = CollectionRead<typeof boards>;
export type Column = CollectionRead<typeof columns>;
export type Card = CollectionRead<typeof cards>;

export const db = await createDatabase("board", [boards, columns, cards], {
  worker: new Worker(new URL("./db-worker.ts", import.meta.url), {
    type: "module",
  }),
});
