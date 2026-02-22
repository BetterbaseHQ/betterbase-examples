import { createOpfsDb, type CollectionRead } from "@betterbase/sdk/db";
import { albums, photos } from "./collections.js";

export { albums, photos } from "./collections.js";

export type Album = CollectionRead<typeof albums>;
export type Photo = CollectionRead<typeof photos>;

export const db = await createOpfsDb("less-photos", [albums, photos], {
  worker: new Worker(new URL("./db-worker.ts", import.meta.url), {
    type: "module",
  }),
});
