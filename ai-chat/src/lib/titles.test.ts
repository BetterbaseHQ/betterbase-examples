import { describe, expect, it } from "vitest";
import { cleanGeneratedTitle, fallbackTitle, previewText, titlePrompt, UNTITLED } from "./titles";

describe("fallbackTitle", () => {
  it("uses the first line of the message", () => {
    expect(fallbackTitle("What is the capital of France?\nMore context")).toBe(
      "What is the capital of France?",
    );
  });

  it("truncates long lines with an ellipsis", () => {
    const title = fallbackTitle("x".repeat(100));
    expect(title.length).toBe(60);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back to the untitled marker for empty input", () => {
    expect(fallbackTitle("   \n  ")).toBe(UNTITLED);
  });
});

describe("cleanGeneratedTitle", () => {
  it("strips surrounding quotes and trailing punctuation", () => {
    expect(cleanGeneratedTitle('"Capital Cities"')).toBe("Capital Cities");
    expect(cleanGeneratedTitle("Math help.")).toBe("Math help");
  });

  it("collapses to a single line", () => {
    expect(cleanGeneratedTitle("Two\nlines")).toBe("Two");
  });

  it("keeps the title when the model answers with a leading newline", () => {
    // Observed LFM2.5 output for the `Title:` prompt — the first line is
    // empty, so the first usable line only appears after trimming.
    expect(cleanGeneratedTitle("\n\nRainbow Explanation")).toBe("Rainbow Explanation");
  });

  it("caps the length", () => {
    const cleaned = cleanGeneratedTitle("word ".repeat(30));
    expect(cleaned).not.toBeNull();
    expect(cleaned!.length).toBeLessThanOrEqual(60);
  });

  it("returns null when nothing usable remains", () => {
    expect(cleanGeneratedTitle('""')).toBeNull();
    expect(cleanGeneratedTitle("  \n ")).toBeNull();
  });
});

describe("previewText", () => {
  it("strips the markdown structures the model emits", () => {
    const reply = [
      "# Markdown Mastery",
      "",
      "Here's a polished example:",
      "",
      "```markdown",
      "## Section Title",
      "- Item 1",
      "- Item 2",
      "```",
      "",
      "| Column A | Column B |",
      "|---------|---------|",
      "| Data 1   | Value    |",
    ].join("\n");
    expect(previewText(reply)).toBe(
      "Markdown Mastery Here's a polished example: Column A Column B Data 1 Value",
    );
  });

  it("keeps link and image text without the syntax", () => {
    expect(previewText("See [the docs](https://example.com) and ![logo](x.png).")).toBe(
      "See the docs and logo.",
    );
  });

  it("unwraps emphasis and inline code", () => {
    expect(previewText("**Bold** and *italic* and `code` and ~~gone~~")).toBe(
      "Bold and italic and code and gone",
    );
  });

  it("drops fenced code blocks whole, including their content", () => {
    expect(previewText("Before:\n```bash\nnpm install\n```\nAfter.")).toBe("Before: After.");
  });

  it("drops an unterminated code fence and everything after it", () => {
    // A reply the user stopped mid-stream can end inside a fence.
    expect(previewText("Short answer:\n```js\nconst x = 1;")).toBe("Short answer:");
  });

  it("leaves plain text unchanged", () => {
    expect(previewText("Just a normal sentence.")).toBe("Just a normal sentence.");
  });

  it("returns empty for empty and whitespace-only input", () => {
    expect(previewText("")).toBe("");
    expect(previewText("  \n\t ")).toBe("");
  });

  it("strips emphasis inside headings", () => {
    expect(previewText("# **Bold** and *ital*")).toBe("Bold and ital");
  });

  it("leaves intraword underscores alone", () => {
    expect(previewText("snake_case_var stays")).toBe("snake_case_var stays");
  });
});

describe("titlePrompt", () => {
  it("includes the exchange", () => {
    const prompt = titlePrompt("hi", "hello!");
    expect(prompt).toContain("User: hi");
    expect(prompt).toContain("Assistant: hello!");
    expect(prompt).toContain("Title:");
  });
});
