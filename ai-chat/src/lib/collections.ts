import { collection, t } from "betterbase/db";

export const threads = collection("threads")
  .v(1, {
    /** Empty string until the model names the thread after the first exchange. */
    title: t.string(),
    lastMessageText: t.text(),
    lastMessageAt: t.number(),
  })
  .build();

export const messages = collection("messages")
  .v(1, {
    threadId: t.string(),
    role: t.union(t.literal("user"), t.literal("assistant")),
    text: t.text(),
    /** The thinking model's `<think>` trace, kept separate from the answer. */
    reasoning: t.optional(t.text()),
    sentAt: t.number(),
  })
  .v(
    2,
    {
      threadId: t.string(),
      role: t.union(t.literal("user"), t.literal("assistant")),
      text: t.text(),
      /** The thinking model's `<think>` trace, kept separate from the answer. */
      reasoning: t.optional(t.text()),
      sentAt: t.number(),
      /** Ordered non-text parts (reasoning + tool calls), JSON-encoded
       * (see PersistedPart in message-parts.ts). */
      tools: t.optional(t.text()),
    },
    // v1 records simply had no tool calls.
    (data) => data,
  )
  .build({
    parent: { field: "threadId", collection: () => threads },
  });
