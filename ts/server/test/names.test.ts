import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH, cleanName } from "../src/names.ts";

describe("cleanName", () => {
  it("keeps an ordinary name, trimming and collapsing white space", () => {
    expect(cleanName("Sam")).toBe("Sam");
    expect(cleanName("  Sam  ")).toBe("Sam");
    expect(cleanName("Mary   Jo\t\nAnn")).toBe("Mary Jo Ann");
  });

  it("assumes nothing about who is playing: any script, accents and emoji are fine", () => {
    for (const name of ["Zoë", "José", "Ørjan", "李雷", "Ольга", "محمد", "आरव", "O'Brien", "Jo-Ann", "🎲Dice", "x"]) {
      expect(cleanName(name)).toBe(name.normalize("NFC"));
    }
  });

  it("counts characters, not bytes: sixteen is the most", () => {
    expect(MAX_NAME_LENGTH).toBe(16);
    expect(cleanName("a".repeat(16))).toBe("a".repeat(16));
    expect(cleanName("a".repeat(17))).toBeNull();
    expect(cleanName("李".repeat(16))).toBe("李".repeat(16)); // 48 bytes, 16 characters
    expect(cleanName("🎲".repeat(16))).toBe("🎲".repeat(16)); // an emoji is one character, two UTF-16 units
    expect(cleanName("🎲".repeat(17))).toBeNull();
  });

  it("composes accents the same way however they were typed", () => {
    expect(cleanName("Zoë")).toBe("Zoë");
  });

  it("keeps the joiners some languages cannot spell names without", () => {
    expect(cleanName("می‌خواهم")).toContain("‌");
  });

  it("turns away what cannot be shown safely", () => {
    for (const bad of [
      "", "   ", "\n\t", "a\u0000b", "a\u0007b", "‮evil", "a⁦b", "\ud800", "ab", "͸",
      null, undefined, 5, {}, [], "x".repeat(300),
    ]) {
      expect(cleanName(bad)).toBeNull();
    }
  });
});
