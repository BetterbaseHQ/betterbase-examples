/**
 * Declared default (sample) data for Notes.
 *
 * Single source of truth for seeding (post-bootstrap `useDefaultRecord`)
 * and for adoption: `isPristine` filters unchanged seeds out of the
 * anonymous→account merge, so a first visit that only seeded the default
 * notebook never pollutes the account. `sortOrder` is static: the seed
 * only runs on a verifiably empty collection, where maxOrder + 1 is
 * always 1. See tasks/src/lib/defaults.ts for the full rationale.
 */
import { defineDefaultData, defaultRecordId } from "@betterbase/examples-shared";
import { notebooks } from "./collections.js";

export const defaultData = defineDefaultData({
  [notebooks.name]: [
    {
      id: defaultRecordId(notebooks),
      name: "My Notebook",
      sortOrder: 1,
    },
  ],
});
