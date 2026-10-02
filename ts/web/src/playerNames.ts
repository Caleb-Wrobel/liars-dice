import type { Rng } from "@liars-dice/engine";
import type { ThemeId } from "./theme.ts";

/**
 * The names a table style offers the player by default. The game assumes nothing about who is playing, so every
 * name should work equally well for anyone, and should suit the style's setting and era. Alice at a saloon is the
 * counter-example: a real name of the time, but a clearly gendered one. Ashleigh was used for men and women alike.
 * A pool can hold a single name, and it is still picked through the same random choice.
 *
 * These are drafts for Caleb to approve. Each is at most 16 characters, the length of the name field.
 */
export const PLAYER_NAMES: Readonly<Record<ThemeId, readonly [string, ...string[]]>> = {
  saloon: ["Ashleigh", "Marion", "Jessie", "Hollis", "Carroll", "Sidney", "Leslie", "Frankie"],
  casino: ["Jordan", "Casey", "Morgan", "Riley", "Quinn", "Jamie", "Taylor", "Avery"],
  spooky: ["Raven", "Ash", "Sage", "Wren", "Ember", "Rowan", "Willow", "Briar"],
};

/** One entry of the pool, chosen at random. A pool of one always gives that one. */
export function pickOne<T>(pool: readonly [T, ...T[]], rng: Rng = Math.random): T {
  return pool[Math.min(Math.floor(rng() * pool.length), pool.length - 1)]!;
}

export const pickPlayerName = (theme: ThemeId, rng: Rng = Math.random): string => pickOne(PLAYER_NAMES[theme], rng);
