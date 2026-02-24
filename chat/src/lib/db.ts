import { createDatabase, type CollectionRead } from "betterbase/db";
import { conversations, messages } from "./collections.js";

export { conversations, messages } from "./collections.js";

export type Conversation = CollectionRead<typeof conversations>;
export type Message = CollectionRead<typeof messages>;

export const db = await createDatabase("chat", [conversations, messages], {
  worker: new Worker(new URL("./db-worker.ts", import.meta.url), {
    type: "module",
  }),
});
