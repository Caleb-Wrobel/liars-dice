import type { ArchetypeId } from "@liars-dice/engine";
import type { ThemeId } from "../theme.ts";
import { CASINO } from "./casino.ts";
import type { Cast, Persona } from "./persona.ts";
import { SALOON } from "./saloon.ts";
import { SPOOKY } from "./spooky.ts";

export { initialsOf } from "./persona.ts";
export type { Cast, Persona } from "./persona.ts";

/** Every theme dresses the archetypes in its own way. A new theme fails to compile until it does. */
export const PERSONAS: Readonly<Record<ThemeId, Cast>> = { saloon: SALOON, casino: CASINO, spooky: SPOOKY };

export const personaFor = (theme: ThemeId, archetype: ArchetypeId): Persona => PERSONAS[theme][archetype];
