import { seededRng } from "@liars-dice/engine";
import { describe, expect, it } from "vitest";
import { BLOCKED_CODES, CODE_ALPHABET, CODE_LENGTH, generateCode, isBlocked, normalizeCode } from "../src/codes.ts";
import { secureRng } from "../src/random.ts";

describe("room codes", () => {
  it("are four letters, all from the alphabet, with no vowels or look-alikes", () => {
    expect(CODE_LENGTH).toBe(4);
    expect(CODE_ALPHABET).toHaveLength(20);
    expect(new Set(CODE_ALPHABET).size).toBe(20);
    for (const bad of "AEIOUY0123456789") expect(CODE_ALPHABET).not.toContain(bad);
    const rng = seededRng(1);
    for (let i = 0; i < 2000; i++) expect(generateCode(rng)).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  });

  it("never hand out a blocked code, even when the draw lands on one", () => {
    // Force the first draw to be a blocked code, and every later draw to be fine.
    const draws = [..."BTCH"].map((l) => (CODE_ALPHABET.indexOf(l) + 0.5) / CODE_ALPHABET.length);
    const later = seededRng(3);
    let calls = 0;
    const rng = () => (calls < draws.length ? draws[calls++]! : (calls++, later()));
    expect(isBlocked("BTCH")).toBe(true);
    expect(generateCode(rng)).not.toBe("BTCH");
    expect(calls).toBeGreaterThan(draws.length); // it drew again

    const wide = seededRng(11);
    for (let i = 0; i < 30_000; i++) expect(BLOCKED_CODES.has(generateCode(wide))).toBe(false);
  });

  it("only block four-letter codes the alphabet can spell", () => {
    for (const code of BLOCKED_CODES) expect(normalizeCode(code)).toBe(code);
  });

  it("spread across the codes, so one is not much likelier than another", () => {
    const rng = seededRng(5);
    const firstLetters = new Map<string, number>();
    for (let i = 0; i < 20_000; i++) {
      const c = generateCode(rng)[0]!;
      firstLetters.set(c, (firstLetters.get(c) ?? 0) + 1);
    }
    expect(firstLetters.size).toBe(20);
    for (const count of firstLetters.values()) expect(count).toBeGreaterThan(800); // about 1000 each
  });

  it("are read back whatever the case or spacing, and nothing else", () => {
    expect(normalizeCode("kqtm")).toBe("KQTM");
    expect(normalizeCode(" k t\tm r ")).toBe("KTMR");
    for (const bad of ["", "ABC", "KTMRX", "KTM1", "KTMA", "KT-M", "ＫＴＭＲ", null, undefined, 7, {}, "K".repeat(100)]) {
      expect(normalizeCode(bad)).toBeNull();
    }
  });
});

describe("secure randomness", () => {
  it("stays in [0, 1) and is not constant", () => {
    const values = Array.from({ length: 500 }, () => secureRng());
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(490);
  });
});
