import type { Rng } from "@liars-dice/engine";

/**
 * A room code is four letters, easy to say aloud and to type. Consonants only, so a code is almost never a word, and
 * none that look alike or sound alike across a phone line beyond what four letters allow: no vowels, no Y, no digits.
 * 20 letters make 160,000 codes. A code only gets a stranger into an open seat; it is not a secret.
 */
export const CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
export const CODE_LENGTH = 4;

/**
 * Codes never handed out, because they read as rude. Without vowels few four-letter strings do, so this is short, and
 * easy to extend. The generator draws again when it lands on one.
 */
export const BLOCKED_CODES: ReadonlySet<string> = new Set([
  "BTCH", "CNTS", "DCKS", "FCKD", "FCKS", "FGGT", "FGTS", "NGGR", "NGRS", "SHTS", "TWTS", "WNKR", "WTFS",
]);

export const isBlocked = (code: string): boolean => BLOCKED_CODES.has(code);

/** A fresh code, never a blocked one. The caller checks it is not already in use. */
export function generateCode(rng: Rng): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]!;
    if (!isBlocked(code)) return code;
  }
}

/** What a player typed, as a code: spaces and case do not matter. Null if it cannot be one. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 32) return null;
  const code = raw.replace(/\s+/g, "").toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  for (const letter of code) if (!CODE_ALPHABET.includes(letter)) return null;
  return code;
}
