/**
 * The archetypes: the fixed set of ways a bot can play, with no names or faces. Each is a few habit numbers on top
 * of a level; none changes how readily the bot pulls the cup, so an archetype is not stronger or weaker than its level.
 * Themes dress them as personas (names, bios and so on) in the web app.
 *
 * Two small departures from neutral, both measured. The honest archetype stays 1 to 2 points ahead of a fair share at
 * every table size, because the honest man being the best at liar's dice is the joke. The gambler runs about 1 point
 * behind at tables of 2 or 3. The other three are within about 0.7 points of fair. Measured by the tables sweep at
 * 40,000 games per job; see the balance snapshot in sim/README.md for the numbers, and re-run it after any change here.
 */
import type { Archetype } from "./archetype.ts";
import type { Rng } from "./rng.ts";

/** The ids, in one place so a theme can be required to dress every one of them. A test keeps this in step with ARCHETYPES. */
export const ARCHETYPE_IDS = ["bluffer", "honest", "sandbagger", "gambler", "creeper"] as const;
export type ArchetypeId = (typeof ARCHETYPE_IDS)[number];

export const ARCHETYPES: readonly Archetype<ArchetypeId>[] = [
  {
    id: "bluffer",
    name: "Bluffer",
    brief: "Makes big jumps on the standing claim, whether or not the dice back it up.",
    habits: { bluff: [2, 3, 5, 6], sandbag: [0, 1, 2, 3], rearrange: 0.7 },
  },
  {
    id: "honest",
    name: "Honest",
    brief: "Claims what it holds. When it cannot beat you it edges up a rung or two, and it shows.",
    habits: { bluff: [1, 1, 2, 3], sandbag: [0, 1, 1, 2, 3], rearrange: 0.3 },
  },
  {
    id: "sandbagger",
    name: "Sandbagger",
    brief: "Says less than it holds and lets the claim climb, so its real hand stays hidden.",
    habits: { bluff: [1, 2, 3], sandbag: [1, 2, 3, 4], rearrange: 0.2 },
  },
  {
    id: "gambler",
    name: "Gambler",
    brief: "Barely looks at its dice, and now and then claims without looking at all.",
    habits: { bluff: [2, 3, 5], sandbag: [0, 1, 2, 3], rearrange: 0.8, blindClaim: 0.12 },
  },
  {
    id: "creeper",
    name: "Creeper",
    brief: "Inches up the ladder one rung at a time and never shows its hand.",
    habits: { bluff: [1], sandbag: [1, 2, 3], rearrange: 0.5 },
  },
];

/** Archetypes drawn at random, without repeats, to fill a table. Asks for more than five and gets five. */
export function drawArchetypes(count: number, rng: Rng = Math.random): Archetype<ArchetypeId>[] {
  const pool = [...ARCHETYPES];
  const take = Math.min(Math.max(count, 0), pool.length); // fixed now: the pool shrinks as we draw
  const drawn: Archetype<ArchetypeId>[] = [];
  for (let i = 0; i < take; i++) {
    drawn.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  }
  return drawn;
}

/**
 * How an archetype reads, each meter from 1 to 5 relative to the rest of the set.
 *
 * Naming: a meter is a gerund, the "-ing" form of a verb used as a noun (bluffing, withholding, gambling). It names
 * something the bot does, not a trait it has. A meter added later follows the same pattern.
 */
export interface Weights {
  /** How big its bluffs are. */
  readonly bluffing: number;
  /** How much it understates its hand, claiming less than it holds. */
  readonly withholding: number;
  /** How much it gambles with the dice: claiming blind, skipping rolls, fidgeting. */
  readonly gambling: number;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The raw habit behind each weight. A higher number means more of that behaviour. */
const RAW: Record<keyof Weights, (p: Archetype) => number> = {
  bluffing: (p) => mean(p.habits.bluff ?? [2.4]),
  withholding: (p) => mean(p.habits.sandbag ?? [1.2]),
  gambling: ({ habits: h }) => (h.gambleRoll ?? 0) + 2 * (h.blindClaim ?? 0) + 0.3 * (h.rearrange ?? 0.5),
};

/**
 * Weights computed from the habits themselves, so the Meet page can never disagree with the bot.
 * They are relative: the most bluffing archetype of the set scores 5 for bluffing and the least scores 1.
 * An archetype outside the set is scored against the set plus itself.
 */
export function weightsOf(archetype: Archetype, among: readonly Archetype[] = ARCHETYPES): Weights {
  const pool = among.some((p) => p.id === archetype.id) ? among : [...among, archetype];
  const weigh = (raw: (p: Archetype) => number) => {
    const values = pool.map(raw);
    const low = Math.min(...values);
    const high = Math.max(...values);
    return high === low ? 3 : Math.round(1 + (4 * (raw(archetype) - low)) / (high - low));
  };
  return { bluffing: weigh(RAW.bluffing), withholding: weigh(RAW.withholding), gambling: weigh(RAW.gambling) };
}
