<!-- Generated from the game's own data. Do not edit by hand: change the data, then run `npm test -- -u` in ts/web. -->

# Casino table: High Rollers

Spoilers ahead. In the game, the "Meet the High Rollers" page shows only a name, a title and a short bio for each
character, and players learn the rest by watching them play. This page is for the curious.

## The characters

| Character | Title | Archetype | Bluffing | Withholding | Gambling |
|---|---|---|---|---|---|
| Vegas Vi | The Showrunner | Bluffer | 5 / 5 | 1 / 5 | 2 / 5 |
| Square-Deal Sol | The Straight Shooter | Honest | 2 / 5 | 1 / 5 | 1 / 5 |
| Slow-Roll Ruth | The Slow Roller | Sandbagger | 2 / 5 | 5 / 5 | 1 / 5 |
| Jackpot Jo | The High Roller | Gambler | 4 / 5 | 1 / 5 | 5 / 5 |
| Ice-Cold Ivy | The Cool Hand | Creeper | 1 / 5 | 3 / 5 | 2 / 5 |

## Reading the weights

Each score runs from 1 to 5, **relative to the other archetypes**, so a 5 means "the most of the set", not a fixed
amount. Adding an archetype can change every score.

- **Bluffing:** how big its bluffs are.
- **Withholding:** how much it understates its hand, claiming less than it holds so you keep climbing.
- **Gambling:** how much it gambles with the dice, such as claiming without looking, skipping a roll or fidgeting.

The scores are computed from the habits the bot really plays with, so they cannot disagree with it. A character's
habits never change how strong it is. Strength belongs to the bot level you pick on the setup screen.

## In plain words

- **Vegas Vi** (Bluffer): Makes big jumps on the standing claim, whether or not the dice back it up.
  - Bio: Big smile, bigger raises. Loves a dramatic reveal and never says what is in the cup.
- **Square-Deal Sol** (Honest): Claims what it holds. When it cannot beat you it edges up a rung or two, and it shows.
  - Bio: Says what he holds and plays it straight. When he runs out of road he nudges up a rung, and it shows.
- **Slow-Roll Ruth** (Sandbagger): Says less than it holds and lets the claim climb, so its real hand stays hidden.
  - Bio: Plays it low and lets the claim climb. You won't see the trap until it shuts.
- **Jackpot Jo** (Gambler): Barely looks at its dice, and now and then claims without looking at all.
  - Bio: Hardly glances at the dice, and sometimes calls it before looking at all.
- **Ice-Cold Ivy** (Creeper): Inches up the ladder one rung at a time and never shows its hand.
  - Bio: Steady as a dealer's shuffle. Edges the claim up one step at a time and gives nothing away.
