<!-- Generated from the game's own data. Do not edit by hand: change the data, then run `npm test -- -u` in ts/web. -->

# Saloon table: Rogues' Gallery

Spoilers ahead. In the game, the "Meet the Rogues' Gallery" page shows only a name, a title and a short bio for each
character, and players learn the rest by watching them play. This page is for the curious.

## The characters

| Character | Title | Archetype | Bluffing | Withholding | Gambling |
|---|---|---|---|---|---|
| Calico Kate | The Bluffer | Bluffer | 5 / 5 | 1 / 5 | 2 / 5 |
| Straight-Up Sam | The Honest Man | Honest | 2 / 5 | 1 / 5 | 1 / 5 |
| Quiet Mabel | The Sandbagger | Sandbagger | 2 / 5 | 5 / 5 | 1 / 5 |
| Lucky Lou | The Gambler | Gambler | 4 / 5 | 1 / 5 | 5 / 5 |
| Deadeye Dan | The Creeper | Creeper | 1 / 5 | 3 / 5 | 2 / 5 |

## Reading the weights

Each score runs from 1 to 5, **relative to the other archetypes**, so a 5 means "the most of the set", not a fixed
amount. Adding an archetype can change every score.

- **Bluffing:** how big its bluffs are.
- **Withholding:** how much it understates its hand, claiming less than it holds so you keep climbing.
- **Gambling:** how much it gambles with the dice, such as claiming without looking, skipping a roll or fidgeting.

The scores are computed from the habits the bot really plays with, so they cannot disagree with it. A character's
habits never change how strong it is. Strength belongs to the bot level you pick on the setup screen.

## In plain words

- **Calico Kate** (Bluffer): Makes big jumps on the standing claim, whether or not the dice back it up.
  - Bio: Makes big jumps and rarely lets you see her sweat. Always has a story, and loves telling it.
- **Straight-Up Sam** (Honest): Claims what it holds. When it cannot beat you it edges up a rung or two, and it shows.
  - Bio: Claims what he holds. When he can't beat you he edges up one rung, and it shows.
- **Quiet Mabel** (Sandbagger): Says less than it holds and lets the claim climb, so its real hand stays hidden.
  - Bio: Says less than she holds and lets you climb. Hard to tell what she is sitting on.
- **Lucky Lou** (Gambler): Barely looks at its dice, and now and then claims without looking at all.
  - Bio: Barely looks at his dice, and now and then claims without looking at all.
- **Deadeye Dan** (Creeper): Inches up the ladder one rung at a time and never shows its hand.
  - Bio: Inches up the ladder one rung at a time and never shows his hand.
