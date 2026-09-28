const MAX_TITLE_LENGTH = 60;

/** Placeholder title until the model names the thread. */
export const UNTITLED = "New chat";

/** First-line truncation used when the model can't generate a title. */
export function fallbackTitle(firstUserMessage: string): string {
  const firstLine = firstUserMessage.trim().split("\n", 1)[0]!.trim();
  if (firstLine === "") return UNTITLED;
  return firstLine.length > MAX_TITLE_LENGTH
    ? `${firstLine.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : firstLine;
}

/** Prompt that asks the model to name the thread. Inputs are truncated so a
 * huge reply can't blow up the prompt. */
export function titlePrompt(userText: string, assistantReply: string): string {
  return [
    "Name this conversation in 3-6 words. No quotes, no trailing punctuation, title case.",
    "",
    `User: ${userText.slice(0, 500)}`,
    `Assistant: ${assistantReply.slice(0, 500)}`,
    "",
    "Title:",
  ].join("\n");
}

const QUOTES = /^["'“”‘’]+|["'“”‘’]+$/g;

/**
 * Normalize a model-generated title: strip quoting/newlines, collapse to one
 * line, cap length. Returns null if nothing usable remains (caller falls
 * back to truncation).
 *
 * Trim BEFORE taking the first line: the model answers the `Title:` prompt
 * with a leading newline (`"\n\nRainbow Explanation"`), and splitting first
 * would take the empty line and discard every generated title.
 */
export function cleanGeneratedTitle(raw: string): string | null {
  const cleaned = raw
    .trim()
    .split("\n", 1)[0]!
    .replace(/\s+/g, " ")
    .trim()
    .replace(QUOTES, "")
    .trim()
    .replace(/[.!?:;,]+$/, "")
    .trim();
  if (cleaned === "") return null;
  return cleaned.length > MAX_TITLE_LENGTH
    ? `${cleaned.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : cleaned;
}
