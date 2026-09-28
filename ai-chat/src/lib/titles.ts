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

/**
 * Plain-text rendering of a markdown message for the sidebar preview:
 * fences, headings, emphasis, lists, tables and links collapsed to words.
 * Runs at render time so existing threads (which store markdown previews)
 * display correctly too. A reply that is only a fenced code block strips
 * to "" (the sidebar then shows its empty-state line).
 */
export function previewText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(?:```|$)/g, " ") // fenced code (incl. unterminated)
    .replace(/`([^`]+)`/g, "$1") // inline code → content
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → link text
    .replace(/\|/g, " ") // table cell pipes (separator rows then match the hr rule)
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s{0,3}(?:[-*+•]|\d+[.)])\s+/gm, "") // list markers
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, "") // horizontal rules / table separators
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/(?<!\w)__([^_]+)__(?!\w)/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1") // italics
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1")
    .replace(/~~(.*?)~~/g, "$1") // strikethrough
    .replace(/\s+/g, " ")
    .trim();
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
