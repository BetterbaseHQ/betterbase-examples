/**
 * Declared default (sample) data for Tasks.
 *
 * Single source of truth for two consumers:
 * - seeding — both the logged-out workspace's emptiness check and the
 *   synced path's post-bootstrap `useDefaultRecord` write these records.
 * - adoption — `isPristine` filters unchanged seeds out of the
 *   anonymous→account merge: a first visit that only seeded defaults
 *   must not pollute the account (they would sync to every device).
 *
 * Edits to a seeded record (renamed list, added todos) diverge from the
 * declaration and adopt as real data. Payloads must stay static —
 * stable ids keep concurrent seeds on two devices collapsible by CRDT
 * merge.
 */
import { defineDefaultData, defaultRecordId } from "@betterbase/examples-shared";
import { lists } from "./collections.js";

export const defaultData = defineDefaultData({
  [lists.name]: [
    {
      id: defaultRecordId(lists),
      name: "My Tasks",
      color: "indigo",
      todos: [],
    },
  ],
});
