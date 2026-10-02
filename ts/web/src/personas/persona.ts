import type { ArchetypeId } from "@liars-dice/engine";

/**
 * A persona dresses an archetype for one table theme: a name, a title and a bio. It deliberately has no
 * habits. How a bot plays belongs to the archetype in the engine, so a skin can change who a bot appears
 * to be but never how it plays.
 */
export interface Persona {
  readonly name: string;
  /** A few words: "The Bluffer". */
  readonly title: string;
  /** Short enough for a phone card. It has to honour the archetype's brief in the engine. */
  readonly bio: string;
}

/** A theme dresses every archetype. A theme that misses one fails to compile. */
export type Cast = Readonly<Record<ArchetypeId, Persona>>;

/** The letters shown in a circle for a persona: the first letters of its first and last words. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
