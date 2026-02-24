import { collection, t } from "betterbase/db";

export const boards = collection("boards")
  .v(1, {
    name: t.string(),
    columns: t.array(
      t.object({
        id: t.string(),
        name: t.string(),
      }),
    ),
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
