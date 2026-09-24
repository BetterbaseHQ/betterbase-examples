/**
 * Declared default (sample) data for Board.
 *
 * Single source of truth for seeding (local emptiness check and the
 * synced path's `useDefaultRecord`) and for adoption: `isPristine`
 * filters unchanged seeds out of the anonymous→account merge. Column ids
 * derive from the board's id, so concurrent seeds on two devices create
 * identical records that CRDTs collapse. See tasks/src/lib/defaults.ts
 * for the full rationale.
 */
import { DEFAULTS_NAMESPACE, defineDefaultData, defaultRecordId, uuidV5 } from "@betterbase/examples-shared";
import { boards, columns } from "./collections.js";

const defaultBoardId = defaultRecordId(boards);
const defaultColumnNames = ["To Do", "In Progress", "Done"];

export const defaultData = defineDefaultData({
  [boards.name]: [{ id: defaultBoardId, name: "My Board" }],
  [columns.name]: defaultColumnNames.map((name, i) => ({
    // Child ids must also be plain UUIDs — the sync server rejects
    // anything else — while staying derived from the board id so two
    // devices seeding concurrently create identical records.
    id: uuidV5(`${defaultBoardId}-col-${i + 1}`, DEFAULTS_NAMESPACE),
    boardId: defaultBoardId,
    name,
    sortOrder: i + 1,
  })),
});
