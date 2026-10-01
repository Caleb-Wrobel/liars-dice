import { describe, expect, it } from "vitest";
import {
  Bot,
  Game,
  advancedRules,
  basicRules,
  parseRank,
  seededRng,
  type PullResult,
} from "../src/index.ts";

describe("Bot", () => {
  it.each([
    ["basic", basicRules()],
    ["advanced", advancedRules()],
  ])("finishes full %s games using only legal moves", (_name, rules) => {
    for (let seed = 0; seed < 60; seed++) {
      const g = new Game(["A", "B", "C"], rules, seededRng(seed));
      const bots = [0, 1, 2].map((i) => new Bot({ rng: seededRng(seed * 10 + i) }));
      for (let turns = 0; turns < 5000 && g.winner === null; turns++) {
        bots[g.current]!.play(g);
      }
      expect(g.winner, `seed ${seed} did not finish`).not.toBeNull();
    }
  });

  it("must pull the top claim", () => {
    const g = new Game(["A", "B"], advancedRules(), seededRng(1));
    g.makeClaim(parseRank("five 6"));
    const result = new Bot({ rng: seededRng(1) }).play(g);
    expect(result).not.toBeNull();
  });

  it("narrates without revealing its dice", () => {
    const g = new Game(["A", "B"], basicRules(), seededRng(5));
    const said: string[] = [];
    new Bot({ rng: seededRng(5) }).play(g, (text) => said.push(text));
    expect(said.at(-1)).toMatch(/^claims /);
    expect(said.join(" ")).not.toContain(g.dice.join(" "));
  });

  it("pulls an unlikely claim and peers at a safe one", () => {
    let g = new Game(["A", "B"], advancedRules(), seededRng(1));
    g.makeClaim(parseRank("five 5")); // nearly impossible with five unseen dice
    const pulled: PullResult | null = new Bot({ rng: seededRng(1) }).play(g);
    expect(pulled).not.toBeNull();

    g = new Game(["A", "B"], advancedRules(), seededRng(1));
    g.makeClaim(parseRank("none 1")); // always true
    expect(new Bot({ rng: seededRng(1) }).play(g)).toBeNull(); // peered and raised instead
  });
});
