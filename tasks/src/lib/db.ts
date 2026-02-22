import { createOpfsDb, type CollectionRead } from "@betterbase/sdk/db";
import { lists } from "./collections.js";

export { lists } from "./collections.js";

export type List = CollectionRead<typeof lists>;
export type TodoItem = List["todos"][number];

export const db = await createOpfsDb("less-tasks", [lists], {
  worker: new Worker(new URL("./db-worker.ts", import.meta.url), { type: "module" }),
});
