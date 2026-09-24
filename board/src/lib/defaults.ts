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
import { defineDefaultData, defaultRecordId } from "@betterbase/examples-shared";
import { boards, columns } from "./collections.js";

const defaultBoardId = defaultRecordId(boards);
const defaultColumnNames = ["To Do", "In Progress", "Done"];

export const defaultData = defineDefaultData({
  [boards.name]: [{ id: defaultBoardId, name: "My Board" }],
  [columns.name]: defaultColumnNames.map((name, i) => ({
    id: `${defaultBoardId}-col-${i + 1}`,
    boardId: defaultBoardId,
    name,
    sortOrder: i + 1,
  })),
});
