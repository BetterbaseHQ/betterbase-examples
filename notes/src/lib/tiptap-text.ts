/** Plain-text helpers for tiptap JSON bodies (stored as serialized JSON strings). */

type TiptapNode = { type?: string; text?: string; content?: unknown[] };

function walkTexts(node: TiptapNode, texts: string[]): void {
  if (node.text) texts.push(node.text);
  if (node.content) (node.content as TiptapNode[]).forEach((child) => walkTexts(child, texts));
}

/** Full plain-text content of a note body (for search). */
export function extractText(body: string): string {
  if (!body) return "";
  try {
    const texts: string[] = [];
    walkTexts(JSON.parse(body), texts);
    return texts.join(" ");
  } catch {
    return body;
  }
}

/** Short excerpt for the note list (max 80 chars). */
export function getExcerpt(body: string): string {
  if (!body) return "No content";
  const text = extractText(body).trim();
  if (!text) return "No content";
  return text.slice(0, 80);
}
