import { collection, t } from "betterbase/db";

export const lists = collection("lists")
  .v(1, {
    name: t.string(),
    color: t.string(),
    todos: t.array(
      t.object({
        id: t.string(),
        text: t.text(),
        completed: t.boolean(),
      }),
    ),
  })
  .build();
