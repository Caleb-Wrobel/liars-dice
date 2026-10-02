/**
 * An archetype gives a bot habits: how big it bluffs, how much it understates its hand, how it fidgets
 * with the dice. It is theme-free. A table theme dresses each archetype as a persona with a name, a bio and
 * so on, but a persona can never carry habits, so a skin cannot change how a bot plays.
 *
 * Habits are deliberately limited to things that barely change how strong a bot is. How readily it pulls
 * the cup, and how well it reads the odds, belong to its level, so an archetype and a level stay independent.
 */
export interface Habits {
  /** How many rungs above the standing claim it bluffs, chosen at random. Replaces the level's. */
  readonly bluff?: readonly number[];
  /** How many rungs below its real rank it may claim, chosen at random. Replaces the level's. */
  readonly sandbag?: readonly number[];
  /** Chance it rearranges the sets whenever it can. Defaults to 0.5. */
  readonly rearrange?: number;
  /** Advanced rules only: chance it skips the roll even when its hand is too weak to keep. */
  readonly gambleRoll?: number;
  /** Advanced rules only: chance it claims without looking at the result, when facing a claim. */
  readonly blindClaim?: number;
}

export interface Archetype<Id extends string = string> {
  /** Stable and theme-free: "bluffer". Themes key their personas by it, and sweep results use it. */
  readonly id: Id;
  /** A generic name for reports: "Bluffer". A theme may title its own persona differently. */
  readonly name: string;
  /** One plain line on how it plays. Every persona's bio in every theme has to honour it. */
  readonly brief: string;
  readonly habits: Habits;
}
