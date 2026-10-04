export const MAX_NAME_LENGTH = 16;

/** Text direction overrides can make one name read as another, so they are not allowed. */
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/;
/** Control characters, lone surrogates, private use and unassigned code points. */
const UNPRINTABLE = /[\p{Cc}\p{Cs}\p{Co}\p{Cn}]/u;

/**
 * A player's name, tidied: runs of white space become one space and the ends are trimmed. The game assumes nothing about
 * who is playing, so any script, accents and emoji are fine; only what cannot be shown safely is turned away. Joiners
 * such as the zero-width non-joiner are kept, because some languages cannot spell names without them. Names are
 * always drawn as text, never as markup. Returns null for a name that is not a string, empty, too long (in characters,
 * not bytes) or contains something unprintable.
 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 256) return null;
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length === 0 || [...name].length > MAX_NAME_LENGTH) return null;
  if (UNPRINTABLE.test(name) || BIDI_CONTROLS.test(name)) return null;
  return name;
}
