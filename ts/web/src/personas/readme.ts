import { ARCHETYPES, weightsOf } from "@liars-dice/engine";
import { THEMES, type ThemeId } from "../theme.ts";
import { PERSONAS } from "./index.ts";

/**
 * The README for one table style: who the characters are and how each one plays. The game itself only shows bios
 * and leaves players to learn the rest by watching, so this is for the curious. The file is generated from the same
 * data the game uses, and a test fails when it is out of date.
 */
export function readmeFor(themeId: ThemeId): string {
  const theme = THEMES.find((t) => t.id === themeId)!;
  const rows = ARCHETYPES.map((archetype) => {
    const persona = PERSONAS[themeId][archetype.id];
    const w = weightsOf(archetype);
    return { archetype, persona, w };
  });

  return `<!-- Generated from the game's own data. Do not edit by hand: change the data, then run \`npm test -- -u\` in ts/web. -->

# ${theme.label} table: ${theme.meet}

Spoilers ahead. In the game, the "Meet the ${theme.meet}" page shows only a name, a title and a short bio for each
character, and players learn the rest by watching them play. This page is for the curious.

## The characters

| Character | Title | Archetype | Bluffing | Candor | Recklessness |
|---|---|---|---|---|---|
${rows
  .map(
    ({ archetype, persona, w }) =>
      `| ${persona.name} | ${persona.title} | ${archetype.name} | ${w.bluffing} / 5 | ${w.candor} / 5 | ${w.recklessness} / 5 |`,
  )
  .join("\n")}

## Reading the weights

Each score runs from 1 to 5, **relative to the other archetypes**, so a 5 means "the most of the set", not a fixed
amount. Adding an archetype can change every score.

- **Bluffing:** how big its bluffs are.
- **Candor:** how closely it claims what it really holds. Low means it understates its hand.
- **Recklessness:** how much it gambles with the dice, such as claiming without looking, skipping a roll or fidgeting.

The scores are computed from the habits the bot really plays with, so they cannot disagree with it. A character's
habits never change how strong it is. Strength belongs to the bot level you pick on the setup screen.

## In plain words

${rows
  .map(({ archetype, persona }) => `- **${persona.name}** (${archetype.name}): ${archetype.brief}\n  - Bio: ${persona.bio}`)
  .join("\n")}
`;
}
