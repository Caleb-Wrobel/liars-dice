import { CATEGORY_LABELS, evaluate } from "@liars-dice/engine";
import { describe, expect, it } from "vitest";
import { RANK_EXAMPLES, exampleName } from "./content.ts";

describe("rank examples", () => {
  it("cover every category once, lowest to highest", () => {
    const categories = RANK_EXAMPLES.map((e) => e.category);
    expect(categories).toEqual([...categories].sort((a, b) => a - b));
    expect(new Set(categories).size).toBe(Object.keys(CATEGORY_LABELS).length);
  });

  it("are five dice that really make the category they illustrate", () => {
    for (const example of RANK_EXAMPLES) {
      expect(example.dice).toHaveLength(5);
      expect(evaluate(example.dice).category, CATEGORY_LABELS[example.category]).toBe(example.category);
    }
  });

  it("are named by the engine", () => {
    expect(RANK_EXAMPLES.map(exampleName)).toEqual([
      "no pair and a 6",
      "a pair of 3s and a 6",
      "two pair, 5s and 2s and a 4",
      "three 4s and a 6",
      "a full house, 3s over 5s",
      "four 6s and a 2",
      "five 2s",
    ]);
  });
});
