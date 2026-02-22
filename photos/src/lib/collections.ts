import { collection, t } from "@betterbase/sdk/db";

export const albums = collection("albums")
  .v(1, {
    name: t.string(),
    sortOrder: t.number(),
  })
  .build();

export const photos = collection("photos")
  .v(1, {
    albumId: t.string(),
    filename: t.string(),
    mimeType: t.string(),
    size: t.number(),
    width: t.number(),
    height: t.number(),
    fileId: t.string(),
    caption: t.text(),
  })
  .build();
