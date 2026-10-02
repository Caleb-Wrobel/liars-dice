# Simulation sweeps

Batches of bot-versus-bot games, used to check that the cast of characters is balanced and to measure how
readable each one is. Results are counts that can be added together, and every job is deterministic from its
seed range, so a sweep can be split up, run anywhere and merged.

| Sweep | Question it answers |
|---|---|
| `duel` | Does each character win about as often as a plain bot of its level? |
| `tables` | Does anyone have an edge at a table of 2 to 5 bots, with random characters and levels? |
| `tells` | How often is a character's claim true, by how far it raised the last claim? |

```
node sim/run-sweep.mjs --sweep tables --games 2000 --workers 3 --out results.json
node sim/summarize.mjs results.json
node sim/run-sweep.mjs --compare a.json b.json     # do two runs agree exactly?
```

`run-sweep.mjs` needs a Node that runs TypeScript directly (22.18 or newer). `summarize.mjs` is plain JavaScript
and runs on any Node. Add `--only TEXT` to run a few jobs, and `--help` for the rest. The everyday test suite
covers the logic. Long runs are for the sweeps themselves, not for `npm test`.

## Tells are emergent, on purpose

Each character's habits (`cast.ts`) are a few numbers: how big its bluffs are, how much it understates its hand, how often it
rearranges. Nobody designs a tell into a character. The tells fall out of those numbers, and the `tells` sweep measures them.
If a character is retuned, or a new one is added, its tells change with it and no separate tell has to be kept in step. That
is the point: it keeps the cast to a handful of honest numbers, in the spirit of getting complexity from fewer rules.

What the sweep reports is how often a claim was true, grouped by how many rungs the character raised the standing claim. Two
things hold for every character at every level: a claim made with the dice left exactly as they are is always true, and a raise
size that a character never uses as a bluff is always true.

Snapshot at Normal level, 5,000 games per job (re-run after any change to `cast.ts` or the bots; the numbers will move):

| Character | Raise 1 | Raise 2 | Raise 3-4 | Raise 5+ |
|---|---|---|---|---|
| Calico Kate | 100% | 24% | 20% | 64% |
| Lucky Lou | 100% | 23% | 19% | 72% |
| Deadeye Dan | 36% | 100% | 100% | 100% |
| Quiet Mabel | 65% | 13% | 8% | 100% |
| Straight-Up Sam | 45% | 26% | 17% | 100% |

Reading it: Dan's single rungs are mostly bluffs and his bigger raises are always real. Mabel and Sam are always honest when they
jump five rungs or more. Kate and Lou look alike here. Lou's blind claims (`blindClaim`) do not show in this table, so it is the
one tell that sweep cannot see.

```
node sim/run-sweep.mjs --sweep tells --games 5000 --workers 7 --out tells.json
node sim/summarize.mjs tells.json
```
