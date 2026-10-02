/**
 * The fixed cast of five opponents. Names, archetypes and bios are drafts for Caleb to approve.
 * Each character's habits are a few numbers on top of a level; none of them changes how readily the
 * bot pulls the cup, so a character is not stronger or weaker than its level.
 */
import type { Personality } from "./personality.ts";
import type { Rng } from "./rng.ts";

export const CAST: readonly Personality[] = [
  {
    id: "calico-kate",
    name: "Calico Kate",
    archetype: "The Bluffer",
    bio: "Makes big jumps and rarely lets you see her sweat. Always has a story, and loves telling it.",
    habits: { bluff: [2, 3, 5, 6], sandbag: [1, 2, 3], rearrange: 0.7 },
  },
  {
    id: "straight-up-sam",
    name: "Straight-Up Sam",
    archetype: "The Honest Man",
    bio: "Claims what he holds. When he can't beat you he edges up one rung, and it shows.",
    habits: { bluff: [1, 1, 2, 3], sandbag: [0, 1, 2], rearrange: 0.5 },
  },
  {
    id: "quiet-mabel",
    name: "Quiet Mabel",
    archetype: "The Sandbagger",
    bio: "Says less than she holds and lets you climb. Hard to tell what she is sitting on.",
    habits: { bluff: [1, 2, 3], sandbag: [1, 2, 3, 4], rearrange: 0.2 },
  },
  {
    id: "lucky-lou",
    name: "Lucky Lou",
    archetype: "The Gambler",
    bio: "Barely looks at his dice, and now and then claims without looking at all.",
    habits: { bluff: [2, 3, 5], sandbag: [0, 1, 2, 3], rearrange: 0.8, blindClaim: 0.12 },
  },
  {
    id: "deadeye-dan",
    name: "Deadeye Dan",
    archetype: "The Creeper",
    bio: "Inches up the ladder one rung at a time and never shows his hand.",
    habits: { bluff: [1], sandbag: [1, 2, 3], rearrange: 0.5 },
  },
];

/** Characters drawn at random, without repeats, to fill a table. Asks for more than five and gets five. */
export function drawCast(count: number, rng: Rng = Math.random): Personality[] {
  const pool = [...CAST];
  const take = Math.min(Math.max(count, 0), pool.length); // fixed now: the pool shrinks as we draw
  const drawn: Personality[] = [];
  for (let i = 0; i < take; i++) {
    drawn.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  }
  return drawn;
}

/** How a personality reads on the Meet page, each from 1 to 5 relative to the rest of the cast. */
export interface Weights {
  /** How big its bluffs are. */
  readonly bluffing: number;
  /** How closely it claims what it really holds. */
  readonly candor: number;
  /** How much it gambles with the dice: claiming blind, skipping rolls, fidgeting. */
  readonly recklessness: number;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The raw habit behind each weight. A higher number means more of that trait. */
const RAW: Record<keyof Weights, (p: Personality) => number> = {
  bluffing: (p) => mean(p.habits.bluff ?? [2.4]),
  candor: (p) => -mean(p.habits.sandbag ?? [1.2]),
  recklessness: ({ habits: h }) => (h.gambleRoll ?? 0) + 2 * (h.blindClaim ?? 0) + 0.3 * (h.rearrange ?? 0.5),
};

/**
 * Weights computed from the habits themselves, so the Meet page can never disagree with the bot.
 * They are relative: the most bluffing character of the cast scores 5 for bluffing and the least scores 1.
 * A personality outside the cast is scored against the cast plus itself.
 */
export function weightsOf(personality: Personality, among: readonly Personality[] = CAST): Weights {
  const pool = among.some((p) => p.id === personality.id) ? among : [...among, personality];
  const weigh = (raw: (p: Personality) => number) => {
    const values = pool.map(raw);
    const low = Math.min(...values);
    const high = Math.max(...values);
    return high === low ? 3 : Math.round(1 + (4 * (raw(personality) - low)) / (high - low));
  };
  return { bluffing: weigh(RAW.bluffing), candor: weigh(RAW.candor), recklessness: weigh(RAW.recklessness) };
}
