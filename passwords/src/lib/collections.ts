import { collection, t } from "@betterbase/sdk/db";

export const entries = collection("entries")
  .v(1, {
    site: t.string(),
    url: t.string(),
    username: t.string(),
    password: t.string(),
    notes: t.text(),
    category: t.string(),
  })
  .build();
