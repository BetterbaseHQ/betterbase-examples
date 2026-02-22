import { collection, t } from "@betterbase/sdk/db";

export const conversations = collection("conversations")
  .v(1, {
    name: t.string(),
    lastMessageText: t.string(),
    lastMessageAt: t.number(),
  })
  .build();

export const messages = collection("messages")
  .v(1, {
    conversationId: t.string(),
    senderHandle: t.string(),
    text: t.text(),
    sentAt: t.number(),
  })
  .build();
