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

const TOKEN_DIGITS = "0123456789abcdef";

/** A secret for one player's place in a room: 32 hex digits, 128 bits when the Rng is secure. */
export function newToken(rng: Rng): string {
  let token = "";
  for (let i = 0; i < 32; i++) token += TOKEN_DIGITS[Math.floor(rng() * 16)]!;
  return token;
}
