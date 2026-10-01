import { Category, evaluate, formatRank } from "@liars-dice/engine";

export interface RankExample {
  readonly category: Category;
  /** A full five-dice hand that makes a rank of this category. */
  readonly dice: readonly number[];
}

/** One example hand per category, lowest rank to highest. Their names come from the engine. */
export const RANK_EXAMPLES: readonly RankExample[] = [
  { category: Category.NoPair, dice: [6, 4, 3, 2, 1] },
  { category: Category.Pair, dice: [3, 3, 6, 4, 1] },
  { category: Category.TwoPair, dice: [5, 5, 2, 2, 4] },
  { category: Category.ThreeKind, dice: [4, 4, 4, 6, 1] },
  { category: Category.FullHouse, dice: [3, 3, 3, 5, 5] },
  { category: Category.FourKind, dice: [6, 6, 6, 6, 2] },
  { category: Category.FiveKind, dice: [2, 2, 2, 2, 2] },
];

/** How the engine reads an example, e.g. "a pair of 3s and a 6". */
export const exampleName = (example: RankExample): string => formatRank(evaluate(example.dice));
