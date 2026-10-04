import { describe, expect, it } from "vitest";
import { seededRng, shuffled } from "../src/index.ts";

describe("shuffled", () => {
  it("returns the same items in some order, leaving the original alone", () => {
    const items = [1, 2, 3, 4, 5, 6];
    const out = shuffled(items, seededRng(1));
    expect([...out].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out).not.toBe(items);
  });

  it("reaches every ordering of a small set about equally often", () => {
    const rng = seededRng(7);
    const counts = new Map<string, number>();
    for (let i = 0; i < 6000; i++) {
      const key = shuffled(["a", "b", "c"], rng).join("");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const n of counts.values()) expect(n).toBeGreaterThan(850); // about 1000 each
  });

  it("repeats for the same seed, handles nothing and one item", () => {
    expect(shuffled([1, 2, 3, 4, 5], seededRng(3))).toEqual(shuffled([1, 2, 3, 4, 5], seededRng(3)));
    expect(shuffled([], seededRng(1))).toEqual([]);
    expect(shuffled(["x"], seededRng(1))).toEqual(["x"]);
  });
});
