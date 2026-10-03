<!-- Generated from the game's own data. Do not edit by hand: change the data, then run `npm test -- -u` in ts/web. -->

# Hacker table: Process List

There are no characters here. The bots wear the engine's own archetype names, and the "Meet the Process List" page
shows their weights as the bios, so choosing this table is choosing to see the balancing data. The player is `root`.

## The characters

| Character | Title | Archetype | Bluffing | Withholding | Gambling |
|---|---|---|---|---|---|
| bluffer | uid 1001 | Bluffer | 5 / 5 | 1 / 5 | 2 / 5 |
| honest | uid 1002 | Honest | 2 / 5 | 1 / 5 | 1 / 5 |
| sandbagger | uid 1003 | Sandbagger | 2 / 5 | 5 / 5 | 1 / 5 |
| gambler | uid 1004 | Gambler | 4 / 5 | 1 / 5 | 5 / 5 |
| creeper | uid 1005 | Creeper | 1 / 5 | 3 / 5 | 2 / 5 |

## Reading the weights

Each score runs from 1 to 5, **relative to the other archetypes**, so a 5 means "the most of the set", not a fixed
amount. Adding an archetype can change every score.

- **Bluffing:** how big its bluffs are.
- **Withholding:** how much it understates its hand, claiming less than it holds so you keep climbing.
- **Gambling:** how much it gambles with the dice, such as claiming without looking, skipping a roll or fidgeting.

The scores are computed from the habits the bot really plays with, so they cannot disagree with it. A character's
habits never change how strong it is. Strength belongs to the bot level you pick on the setup screen.

## In plain words

- **bluffer** (Bluffer): Makes big jumps on the standing claim, whether or not the dice back it up.
  - Bio: Bluffing 5 of 5, Withholding 1 of 5, Gambling 2 of 5
- **honest** (Honest): Claims what it holds. When it cannot beat you it edges up a rung or two, and it shows.
  - Bio: Bluffing 2 of 5, Withholding 1 of 5, Gambling 1 of 5
- **sandbagger** (Sandbagger): Says less than it holds and lets the claim climb, so its real hand stays hidden.
  - Bio: Bluffing 2 of 5, Withholding 5 of 5, Gambling 1 of 5
- **gambler** (Gambler): Barely looks at its dice, and now and then claims without looking at all.
  - Bio: Bluffing 4 of 5, Withholding 1 of 5, Gambling 5 of 5
- **creeper** (Creeper): Inches up the ladder one rung at a time and never shows its hand.
  - Bio: Bluffing 1 of 5, Withholding 3 of 5, Gambling 2 of 5
