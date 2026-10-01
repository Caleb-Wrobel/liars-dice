/**
 * Dice-poker ranks and the ladder of claims.
 *
 * A rank is a category, the faces that define it, and an optional kicker (the
 * highest die left over). "No pair and a 5" and "pair of 2s and a 5" are the same
 * kind of thing. A claim with no kicker ranks below the same claim with any kicker.
 */

export const NUM_DICE = 5;
export const FACES: readonly number[] = [1, 2, 3, 4, 5, 6];

export const Category = {
  NoPair: 0,
  Pair: 1,
  TwoPair: 2,
  ThreeKind: 3,
  FullHouse: 4,
  FourKind: 5,
  FiveKind: 6,
} as const;
export type Category = (typeof Category)[keyof typeof Category];

export interface Rank {
  readonly category: Category;
  /** The faces that define the category, e.g. [5, 2] for two pair, 5s and 2s. */
  readonly faces: readonly number[];
  /** The kicker, or 0 for none. */
  readonly kicker: number;
}

export const rank = (category: Category, faces: readonly number[] = [], kicker = 0): Rank => ({
  category,
  faces,
  kicker,
});

/** How many defining faces each category has. */
const DEFINING: Record<Category, number> = {
  [Category.NoPair]: 0,
  [Category.Pair]: 1,
  [Category.TwoPair]: 2,
  [Category.ThreeKind]: 1,
  [Category.FullHouse]: 2,
  [Category.FourKind]: 1,
  [Category.FiveKind]: 1,
};

/** Categories where dice are left over to act as a kicker. */
const HAS_KICKER: ReadonlySet<Category> = new Set([
  Category.NoPair,
  Category.Pair,
  Category.TwoPair,
  Category.ThreeKind,
  Category.FourKind,
]);

/** Count pattern of the five dice (highest count first) -> category. */
const SHAPES: ReadonlyMap<string, Category> = new Map([
  ["1,1,1,1,1", Category.NoPair],
  ["2,1,1,1", Category.Pair],
  ["2,2,1", Category.TwoPair],
  ["3,1,1", Category.ThreeKind],
  ["3,2", Category.FullHouse],
  ["4,1", Category.FourKind],
  ["5", Category.FiveKind],
]);

const FORMATS: Record<Category, (f: readonly number[]) => string> = {
  [Category.NoPair]: () => "no pair",
  [Category.Pair]: ([a]) => `a pair of ${a}s`,
  [Category.TwoPair]: ([a, b]) => `two pair, ${a}s and ${b}s`,
  [Category.ThreeKind]: ([a]) => `three ${a}s`,
  [Category.FullHouse]: ([a, b]) => `a full house, ${a}s over ${b}s`,
  [Category.FourKind]: ([a]) => `four ${a}s`,
  [Category.FiveKind]: ([a]) => `five ${a}s`,
};

const NAMES: ReadonlyMap<string, Category> = new Map([
  ["none", Category.NoPair],
  ["no pair", Category.NoPair],
  ["nopair", Category.NoPair],
  ["pair", Category.Pair],
  ["two pair", Category.TwoPair],
  ["twopair", Category.TwoPair],
  ["three", Category.ThreeKind],
  ["full", Category.FullHouse],
  ["full house", Category.FullHouse],
  ["four", Category.FourKind],
  ["five", Category.FiveKind],
]);

/**
 * The claim a player is handed when opening a round. It ranks below every real
 * rank, and any rank is at least as good as it.
 */
export const NIL: Rank = rank(Category.NoPair, [], 0);

/** Negative if a < b, zero if equal, positive if a > b: category, then faces, then kicker. */
export function compareRanks(a: Rank, b: Rank): number {
  if (a.category !== b.category) return a.category - b.category;
  const shared = Math.min(a.faces.length, b.faces.length);
  for (let i = 0; i < shared; i++) {
    const diff = a.faces[i]! - b.faces[i]!;
    if (diff !== 0) return diff;
  }
  if (a.faces.length !== b.faces.length) return a.faces.length - b.faces.length;
  return a.kicker - b.kicker;
}

export const sameRank = (a: Rank, b: Rank): boolean => compareRanks(a, b) === 0;

const rankKey = (r: Rank): string => `${r.category}:${r.faces.join(",")}:${r.kicker}`;

export function formatRank(r: Rank): string {
  if (sameRank(r, NIL)) return "nothing";
  const text = FORMATS[r.category](r.faces);
  return r.kicker ? `${text} and a ${r.kicker}` : text;
}

/** The rank the dice actually make, including its kicker. */
export function evaluate(dice: readonly number[]): Rank {
  const counts = new Map<number, number>();
  for (const die of dice) counts.set(die, (counts.get(die) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const category = SHAPES.get(groups.map(([, count]) => count).join(","));
  if (category === undefined) throw new Error(`cannot rank ${dice.length} dice`);
  const split = DEFINING[category];
  const faces = groups.slice(0, split).map(([face]) => face);
  const leftover = groups.slice(split).map(([face]) => face);
  return rank(category, faces, leftover.length > 0 ? Math.max(...leftover) : 0);
}

function definingFaces(category: Category): number[][] {
  switch (category) {
    case Category.NoPair:
      return [[]];
    case Category.TwoPair:
      return FACES.flatMap((hi) => FACES.filter((lo) => hi > lo).map((lo) => [hi, lo]));
    case Category.FullHouse:
      return FACES.flatMap((t) => FACES.filter((p) => p !== t).map((p) => [t, p]));
    default:
      return FACES.map((f) => [f]);
  }
}

/** Every legal rank, lowest to highest. Impossible ones are included. */
export function allRanks(): Rank[] {
  const ranks: Rank[] = [];
  for (const category of Object.values(Category)) {
    for (const faces of definingFaces(category)) {
      const kickers = HAS_KICKER.has(category)
        ? [0, ...FACES.filter((k) => !faces.includes(k))]
        : [0];
      for (const kicker of kickers) ranks.push(rank(category, faces, kicker));
    }
  }
  return ranks.filter((r) => !sameRank(r, NIL)).sort(compareRanks);
}

export const LADDER: readonly Rank[] = allRanks();
export const TOP_RANK: Rank = LADDER[LADDER.length - 1]!;
const LEGAL: ReadonlySet<string> = new Set(LADDER.map(rankKey));

export const isLegal = (r: Rank): boolean => LEGAL.has(rankKey(r));

/** Display names for the categories, lowest to highest. */
export const CATEGORY_LABELS: Record<Category, string> = {
  [Category.NoPair]: "No pair",
  [Category.Pair]: "Pair",
  [Category.TwoPair]: "Two pair",
  [Category.ThreeKind]: "Three of a kind",
  [Category.FullHouse]: "Full house",
  [Category.FourKind]: "Four of a kind",
  [Category.FiveKind]: "Five of a kind",
};

/** How many defining faces a category takes: 0 for no pair, 2 for two pair and full house. */
export const definingFaceCount = (category: Category): number => DEFINING[category];

/** Whether a category can carry a kicker. */
export const hasKicker = (category: Category): boolean => HAS_KICKER.has(category);

/**
 * The dice a rank describes, with any kicker last: "a pair of 3s and a 5" is [3, 3, 5], and "no pair
 * and a 5" is just [5]. Handy for drawing a claim as dice.
 */
export function rankDice(r: Rank): number[] {
  const copies: Record<Category, readonly number[]> = {
    [Category.NoPair]: [],
    [Category.Pair]: [2],
    [Category.TwoPair]: [2, 2],
    [Category.ThreeKind]: [3],
    [Category.FullHouse]: [3, 2],
    [Category.FourKind]: [4],
    [Category.FiveKind]: [5],
  };
  const dice = r.faces.flatMap((face, i) => Array<number>(copies[r.category][i]!).fill(face));
  return r.kicker > 0 ? [...dice, r.kicker] : dice;
}

/** The smallest legal rank above `r`, or undefined at the top of the ladder. */
export const nextRank = (r: Rank): Rank | undefined =>
  LADDER.find((candidate) => compareRanks(candidate, r) > 0);

export class RankParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RankParseError";
  }
}

/**
 * Parse e.g. 'pair 3', 'pair 2 5', 'two pair 5 2 3', 'full 4 2', 'none 5'.
 * Numbers are the defining faces followed by an optional kicker.
 */
export function parseRank(text: string): Rank {
  const words = text.toLowerCase().replaceAll(",", " ").split(/\s+/).filter(Boolean);
  const isNumber = (w: string): boolean => /^\d+$/.test(w);
  const name = words.filter((w) => !isNumber(w)).join(" ");
  const category = NAMES.get(name);
  if (category === undefined) throw new RankParseError(`unknown rank '${name}'`);
  const nums = words.filter(isNumber).map(Number);
  const size = DEFINING[category];
  if (nums.length > size + 1) throw new RankParseError(`too many numbers for '${name}'`);
  const parsed = rank(category, nums.slice(0, size), nums.length > size ? nums[size]! : 0);
  if (!isLegal(parsed)) throw new RankParseError(`not a valid claim: '${text}'`);
  return parsed;
}
