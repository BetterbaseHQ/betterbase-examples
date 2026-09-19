import { describe, it, expect } from "vitest";
import { generatePassword, type GeneratorOptions } from "./EntryForm";

const allOn: GeneratorOptions = {
  lowercase: true,
  uppercase: true,
  numbers: true,
  symbols: true,
};

function classesOf(pw: string) {
  return {
    lowercase: /[a-z]/.test(pw),
    uppercase: /[A-Z]/.test(pw),
    numbers: /[0-9]/.test(pw),
    symbols: /[^a-zA-Z0-9]/.test(pw),
  };
}

describe("generatePassword", () => {
  it("respects the requested length when it covers all selected classes", () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePassword(20, allOn)).toHaveLength(20);
    }
  });

  it("guarantees at least one character from every selected class", () => {
    for (let i = 0; i < 50; i++) {
      const classes = classesOf(generatePassword(24, allOn));
      expect(classes).toEqual({
        lowercase: true,
        uppercase: true,
        numbers: true,
        symbols: true,
      });
    }
  });

  it("only uses characters from the selected classes", () => {
    const lettersOnly = generatePassword(30, {
      lowercase: true,
      uppercase: false,
      numbers: false,
      symbols: false,
    });
    expect(lettersOnly).toMatch(/^[a-z]+$/);
  });

  it("regression: clamps tiny lengths below the class count instead of overflowing", () => {
    // length 2 with 4 classes — the guarantee wins (previously produced 4+
    // chars unpredictably or worse)
    const pw = generatePassword(2, allOn);
    expect(pw.length).toBe(4);
    expect(classesOf(pw)).toEqual({
      lowercase: true,
      uppercase: true,
      numbers: true,
      symbols: true,
    });
  });

  it("falls back to a sensible default when no classes are selected", () => {
    const pw = generatePassword(16, {
      lowercase: false,
      uppercase: false,
      numbers: false,
      symbols: false,
    });
    expect(pw).toMatch(/^[a-z0-9]+$/);
    expect(pw).toHaveLength(16);
  });
});
