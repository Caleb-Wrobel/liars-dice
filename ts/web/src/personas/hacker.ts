import { ARCHETYPES, weightsOf, type ArchetypeId, type Weights } from "@liars-dice/engine";
import type { Cast, Persona } from "./persona.ts";

/**
 * The Hacker table has no characters. Its bots wear the engine's own archetype names, and the bio is the weights,
 * so a player who picks this table is choosing to see the balancing data in the game. It is built from the engine's
 * data, so it can never copy it wrongly or fall behind when an archetype changes.
 *
 * The weights are written as words and numbers ("Bluffing 5 of 5"), one per line, so the meaning never rests on a
 * bar or a colour. The line breaks are real newlines, and the Hacker stylesheet shows them as lines.
 * The title is a Unix-style user id, which keeps each card distinct without inventing a character; root is 0, and
 * the player is root.
 */
export const weightsBio = ({ bluffing, withholding, gambling }: Weights): string =>
  `Bluffing ${bluffing} of 5\nWithholding ${withholding} of 5\nGambling ${gambling} of 5`;

const FIRST_UID = 1001;

export const HACKER: Cast = Object.fromEntries(
  ARCHETYPES.map((archetype, index): [ArchetypeId, Persona] => [
    archetype.id,
    { name: archetype.name, title: `uid ${FIRST_UID + index}`, bio: weightsBio(weightsOf(archetype)) },
  ]),
) as Cast;
