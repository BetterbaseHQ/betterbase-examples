import { describe, expect, it } from "vitest";
import { cleanGeneratedTitle, fallbackTitle, titlePrompt, UNTITLED } from "./titles";

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

describe("titlePrompt", () => {
  it("includes the exchange", () => {
    const prompt = titlePrompt("hi", "hello!");
    expect(prompt).toContain("User: hi");
    expect(prompt).toContain("Assistant: hello!");
    expect(prompt).toContain("Title:");
  });
});
