import { collection, t } from "@betterbase/sdk/db";

export const notebooks = collection("notebooks")
  .v(1, {
    name: t.string(),
    sortOrder: t.number(),
  })
  .build();

export const notes = collection("notes")
  .v(1, {
    notebookId: t.string(),
    title: t.string(),
    body: t.text(),
    pinned: t.boolean(),
    favorite: t.boolean(),
  })
  .build();
