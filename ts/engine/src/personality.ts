/**
 * A personality gives a bot habits: how big it bluffs, how much it understates its hand, how it
 * fidgets with the dice. Habits are deliberately limited to things that barely change how strong a
 * bot is. How readily it pulls the cup, and how well it reads the odds, belong to its level, so a
 * personality and a level stay independent of each other.
 */
export interface PersonalityHabits {
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

export interface Personality {
  readonly id: string;
  readonly name: string;
  /** A few words: "The Bluffer". */
  readonly archetype: string;
  /** A short description for the Meet page. */
  readonly bio: string;
  readonly habits: PersonalityHabits;
}
