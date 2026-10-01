import { describe, expect, it } from "vitest";
import {
  Game,
  LADDER,
  NUM_DICE,
  RuleError,
  advancedRules,
  basicRules,
  nextRank,
  seededRng,
  type Action,
  type Rules,
} from "../src/index.ts";

/**
 * Plays random legal moves and checks the game can never reach a dead end: whenever someone is
 * to move, at least one action the engine offers must actually work.
 */
function randomGame(rules: Rules, players: number, seed: number): string | null {
  const g = new Game(Array.from({ length: players }, (_, i) => `P${i}`), rules, seededRng(seed * 31 + players));
  const rng = seededRng(seed * 17 + 5);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(rng() * items.length)]!;

  /** Try one offered action. `safe` uses parameters that should always be accepted. */
  const attempt = (action: Action, safe: boolean): boolean => {
    try {
      switch (action) {
        case "pull":
          g.pull();
          return true;
        case "peer":
          g.peer();
          return true;
        case "rearrange":
          g.rearrange(safe ? g.visible : [...Array(NUM_DICE).keys()].filter(() => rng() < 0.5));
          return true;
        case "roll": {
          const usable = g.rules.rollable.filter((w) => (w === "hidden" ? NUM_DICE - g.visible.size : g.visible.size) > 0);
          g.roll(safe ? (usable[0] ?? "hidden") : pick(g.rules.rollable));
          return true;
        }
        case "peek":
          g.peek();
          return true;
        case "claim": {
          const higher = safe ? nextRank(g.claim) : pick(LADDER.filter((r) => r.category >= g.claim.category));
          if (!higher) return false;
          g.makeClaim(higher);
          return true;
        }
      }
    } catch (e) {
      if (e instanceof RuleError) return false;
      throw e;
    }
  };

  for (let steps = 0; g.winner === null; steps++) {
    if (steps > 40_000) return "did not finish";
    const offered = g.available();
    if (offered.length === 0) return `no available actions at step ${g.step}`;
    if (attempt(pick(offered), false)) continue; // a random attempt may be legitimately refused
    if (!offered.some((action) => attempt(action, true))) return `stuck: offered [${offered}] but none work`;
  }
  return null;
}

describe("random play", () => {
  it.each([
    ["basic", basicRules()],
    ["advanced", advancedRules()],
  ])("never reaches a dead end under %s rules", (_name, rules) => {
    const failures: string[] = [];
    for (const players of [2, 3, 5]) {
      for (let seed = 0; seed < 60; seed++) {
        const problem = randomGame(rules, players, seed);
        if (problem) failures.push(`${players} players, seed ${seed}: ${problem}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
