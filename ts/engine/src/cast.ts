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
    habits: { bluff: [3, 5, 8, 12], sandbag: [0, 0, 1], rearrange: 0.7 },
  },
  {
    id: "straight-up-sam",
    name: "Straight-Up Sam",
    archetype: "The Honest Man",
    bio: "Claims what he holds. When he can't beat you he edges up one rung, and it shows.",
    habits: { bluff: [1, 1], sandbag: [0], rearrange: 0.3 },
  },
  {
    id: "quiet-mabel",
    name: "Quiet Mabel",
    archetype: "The Sandbagger",
    bio: "Says less than she holds and lets you climb. Hard to tell what she is sitting on.",
    habits: { bluff: [1, 2, 3], sandbag: [2, 3, 4, 6], rearrange: 0.2 },
  },
  {
    id: "lucky-lou",
    name: "Lucky Lou",
    archetype: "The Gambler",
    bio: "Barely looks at his dice. Skips the roll, claims blind, and trusts his luck.",
    habits: { bluff: [2, 3, 5, 8], rearrange: 0.8, gambleRoll: 0.5, blindClaim: 0.4 },
  },
  {
    id: "deadeye-dan",
    name: "Deadeye Dan",
    archetype: "The Creeper",
    bio: "Inches up the ladder one rung at a time and never shows his hand.",
    habits: { bluff: [1], sandbag: [0, 1], rearrange: 0.5 },
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

/** How a personality reads on the Meet page, each from 1 to 5. */
export interface Weights {
  /** How big its bluffs are. */
  readonly bluffing: number;
  /** How closely it claims what it really holds. */
  readonly candor: number;
  /** How much it gambles with the dice: skipping rolls, claiming blind, fidgeting. */
  readonly recklessness: number;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const scale = (value: number) => Math.min(5, Math.max(1, Math.round(value)));

/** Weights computed from the habits themselves, so the Meet page can never disagree with the bot. */
export function weightsOf(personality: Personality): Weights {
  const { bluff = [2.4], sandbag = [1.2], rearrange = 0.5, gambleRoll = 0, blindClaim = 0 } = personality.habits;
  const risk = 0.4 * gambleRoll + 0.4 * blindClaim + 0.2 * rearrange;
  return {
    bluffing: scale(1 + ((mean(bluff) - 1) * 4) / 6),
    candor: scale(5 - mean(sandbag) * (4 / 3.75)),
    recklessness: scale(1 + (4 * risk) / 0.6),
  };
}
