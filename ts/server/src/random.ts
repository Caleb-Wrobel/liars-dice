import type { Rng } from "@liars-dice/engine";

/**
 * Randomness for codes and tokens that must not be guessable: the platform's cryptographic source, scaled to [0, 1)
 * like Math.random. Tests inject a seeded Rng instead, so they replay.
 */
export const secureRng: Rng = () => {
  const word = new Uint32Array(1);
  globalThis.crypto.getRandomValues(word);
  return word[0]! / 4294967296;
};
