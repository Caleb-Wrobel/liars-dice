import { describe, expect, it } from "vitest";
import {
  Category,
  LADDER,
  NIL,
  TOP_RANK,
  compareRanks,
  evaluate,
  formatRank,
  isLegal,
  parseRank,
  rank,
  sameRank,
} from "../src/index.ts";

const { NoPair, Pair, TwoPair, ThreeKind, FullHouse, FourKind, FiveKind } = Category;

const gt = (a: ReturnType<typeof rank>, b: ReturnType<typeof rank>) => compareRanks(a, b) > 0;

describe("evaluate", () => {
  it.each([
    [[6, 6, 6, 6, 6], rank(FiveKind, [6], 0)],
    [[2, 2, 5, 2, 2], rank(FourKind, [2], 5)],
    [[3, 3, 4, 4, 4], rank(FullHouse, [4, 3], 0)],
    [[3, 3, 3, 1, 6], rank(ThreeKind, [3], 6)],
    [[2, 5, 2, 5, 1], rank(TwoPair, [5, 2], 1)],
    [[4, 4, 1, 2, 6], rank(Pair, [4], 6)],
    [[1, 3, 4, 5, 6], rank(NoPair, [], 6)],
    [[1, 2, 3, 4, 5], rank(NoPair, [], 5)], // no straights
  ])("%j", (dice, expected) => {
    expect(evaluate(dice)).toEqual(expected);
  });

  it("rejects the wrong number of dice", () => {
    expect(() => evaluate([1, 2, 3])).toThrow();
  });
});

describe("the ladder", () => {
  it("is complete and sorted", () => {
    expect(LADDER).toHaveLength(225);
    expect([...LADDER].sort(compareRanks)).toEqual(LADDER);
    expect(TOP_RANK).toEqual(rank(FiveKind, [6]));
    expect(gt(LADDER[0]!, NIL)).toBe(true);
    expect(LADDER.some((r) => sameRank(r, NIL))).toBe(false);
  });

  it("orders by category, then faces, then kicker", () => {
    expect(gt(rank(Pair, [2]), rank(Pair, [1]))).toBe(true); // higher faces win
    expect(gt(rank(Pair, [2], 5), rank(Pair, [2], 3))).toBe(true); // then the kicker
    expect(gt(rank(Pair, [2], 1), rank(Pair, [2]))).toBe(true); // any kicker beats none
    expect(gt(rank(TwoPair, [2, 1]), rank(Pair, [6], 5))).toBe(true); // category beats faces
    expect(gt(rank(ThreeKind, [1]), rank(TwoPair, [3, 1]))).toBe(true);
    expect(gt(rank(FullHouse, [1, 2]), rank(ThreeKind, [6], 5))).toBe(true);
    expect(gt(rank(FourKind, [1]), rank(FullHouse, [6, 5]))).toBe(true);
    expect(gt(rank(Pair, [1]), rank(NoPair, [], 6))).toBe(true);
  });

  it("makes every rank at least nil", () => {
    expect(compareRanks(evaluate([1, 3, 4, 5, 6]), NIL)).toBeGreaterThanOrEqual(0);
  });

  it("includes impossible claims", () => {
    expect(isLegal(parseRank("none 1"))).toBe(true);
    expect(isLegal(parseRank("pair 2 1"))).toBe(true);
  });
});

describe("parseRank", () => {
  it.each([
    ["pair 3", rank(Pair, [3])],
    ["pair 2 5", rank(Pair, [2], 5)],
    ["Two Pair 5 2", rank(TwoPair, [5, 2])],
    ["two pair 5 2 3", rank(TwoPair, [5, 2], 3)],
    ["full house 4 2", rank(FullHouse, [4, 2])],
    ["none 5", rank(NoPair, [], 5)],
    ["five 6", rank(FiveKind, [6])],
  ])("%s", (text, expected) => {
    expect(parseRank(text)).toEqual(expected);
  });

  it.each([
    "pair 7",
    "two pair 2 5",
    "full 3 3",
    "pair 3 3",
    "none",
    "straight 5",
    "five 6 1",
    "full 4 2 5",
    "high 1",
    "high card 1",
  ])("rejects %s", (bad) => {
    expect(() => parseRank(bad)).toThrow();
  });
});

describe("formatRank", () => {
  it("reads naturally", () => {
    expect(formatRank(rank(Pair, [2], 5))).toBe("a pair of 2s and a 5");
    expect(formatRank(rank(NoPair, [], 5))).toBe("no pair and a 5");
    expect(formatRank(NIL)).toBe("nothing");
  });
});
