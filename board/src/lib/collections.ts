import { collection, t } from "betterbase/db";

export const boards = collection("boards").v(1, { name: t.string() }).build();

/**
 * Columns are their own records (not an array on the board): concurrent column
 * edits by different peers are then independent CRDT writes — an embedded array
 * would resolve concurrent edits to one winner, silently dropping the other
 * peer's column.
 */
export const columns = collection("columns")
  .v(1, {
    boardId: t.string(),
    name: t.string(),
    sortOrder: t.number(),
  })
  .build();

export const cards = collection("cards")
  .v(1, {
    boardId: t.string(),
    columnId: t.string(),
    title: t.text(),
    description: t.text(),
    color: t.string(),
    order: t.number(),
  })
  .build();
