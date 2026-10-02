# Simulation sweeps

Batches of bot-versus-bot games, used to check that the set of archetypes is balanced and to measure how
readable each one is. Results are counts that can be added together, and every job is deterministic from its
seed range, so a sweep can be split up, run anywhere and merged.

| Sweep | Question it answers |
|---|---|
| `duel` | Does each archetype win about as often as a plain bot of its level? |
| `tables` | Does anyone have an edge at a table of 2 to 5 bots, with random archetypes and levels? |
| `tells` | How often is an archetype's claim true, by how far it raised the last claim? |

```
node sim/run-sweep.mjs --sweep tables --games 2000 --workers 3 --out results.json
node sim/summarize.mjs results.json
node sim/run-sweep.mjs --compare a.json b.json     # do two runs agree exactly?
```

`run-sweep.mjs` needs a Node that runs TypeScript directly (22.18 or newer). `summarize.mjs` is plain JavaScript
and runs on any Node. Add `--only TEXT` to run a few jobs, and `--help` for the rest. The everyday test suite
covers the logic. Long runs are for the sweeps themselves, not for `npm test`.

## Tells are emergent, on purpose

Each archetype's habits (`archetypes.ts`) are a few numbers: how big its bluffs are, how much it understates its hand, how often it
rearranges. Nobody designs a tell into an archetype. The tells fall out of those numbers, and the `tells` sweep measures them.
If an archetype is retuned, or a new one is added, its tells change with it and no separate tell has to be kept in step. That
is the point: it keeps the archetypes to a handful of honest numbers, in the spirit of getting complexity from fewer rules.

What the sweep reports is how often a claim was true, grouped by how many rungs the archetype raised the standing claim. Two
things hold for every archetype at every level: a claim made with the dice left exactly as they are is always true, and a raise
size that an archetype never uses as a bluff is always true.

Snapshot at Normal level, 5,000 games per job (re-run after any change to `archetypes.ts` or the bots; the numbers will move):

| Archetype | Raise 1 | Raise 2 | Raise 3-4 | Raise 5+ |
|---|---|---|---|---|
| Bluffer | 100% | 24% | 20% | 64% |
| Gambler | 100% | 23% | 19% | 72% |
| Creeper | 36% | 100% | 100% | 100% |
| Sandbagger | 65% | 13% | 8% | 100% |
| Honest | 45% | 26% | 17% | 100% |

Reading it: the Creeper's single rungs are mostly bluffs and his bigger raises are always real. the Sandbagger and the Honest archetype are always honest when they
jump five rungs or more. The Bluffer and the Gambler look alike here. The Gambler's blind claims (`blindClaim`) do not show in this table, so it is the
one tell that sweep cannot see.

```
node sim/run-sweep.mjs --sweep tells --games 5000 --workers 7 --out tells.json
node sim/summarize.mjs tells.json
```

## Balance snapshot

Does anyone have an edge at a table? The `tables` sweep at 40,000 games per job, each seat a random archetype at a random
level, with basic and advanced rules mixed. The numbers are the win rate minus a fair share, in percentage points, and at
this size the noise is about 0.5. Strength belongs to the level, so the gaps between archetypes are small next to the
29 points between Stabby and Easy at a table of five.

| Archetype | 2 bots | 3 bots | 4 bots | 5 bots |
|---|---|---|---|---|
| Honest | +0.9 | +1.7 | +1.0 | +1.0 |
| Creeper | +0.9 | 0.0 | 0.0 | +0.1 |
| Bluffer | -0.5 | +0.1 | -0.2 | -0.4 |
| Sandbagger | +0.1 | -0.7 | -0.5 | -0.3 |
| Gambler | -1.3 | -1.1 | -0.2 | -0.5 |

The honest archetype's edge is deliberate. The gambler runs about a point behind at the smaller tables, and has been left as it
is. Re-run after any change to `archetypes.ts` or the bots, since the numbers will move:

```
node sim/run-sweep.mjs --sweep tables --games 40000 --workers 7 --out tables.json
node sim/summarize.mjs tables.json
```
