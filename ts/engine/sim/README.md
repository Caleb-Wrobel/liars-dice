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
