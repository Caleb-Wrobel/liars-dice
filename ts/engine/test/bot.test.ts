import { describe, expect, it } from "vitest";
import {
  BOT_LEVELS,
  BOT_LEVEL_NAMES,
  Bot,
  randomBotLevel,
  type BotLevel,
  Game,
  advancedRules,
  basicRules,
  parseRank,
  rollPhrase,
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

  it.each(BOT_LEVEL_NAMES)("plays full games at the %s level using only legal moves", (level) => {
    for (const rules of [basicRules(), advancedRules()]) {
      for (let seed = 0; seed < 20; seed++) {
        const g = new Game(["A", "B", "C"], rules, seededRng(seed));
        const bots = [0, 1, 2].map((i) => new Bot({ rng: seededRng(seed * 10 + i), level }));
        for (let turns = 0; turns < 5000 && g.winner === null; turns++) bots[g.current]!.play(g);
        expect(g.winner, `${level} seed ${seed} did not finish`).not.toBeNull();
      }
    }
  });

  it("defaults to the normal level", () => {
    expect(new Bot().level).toBe("normal");
    expect(new Bot().style).toEqual(BOT_LEVELS.normal);
    expect(new Bot({ pullBelow: 0.9 }).style.pullBelow).toBe(0.9);
  });

  /** How often a bot facing `claim` (with nothing visible) pulls the cup. */
  const pullRate = (level: BotLevel, claim: string) => {
    let pulls = 0;
    const trials = 300;
    for (let seed = 0; seed < trials; seed++) {
      const g = new Game(["A", "B"], advancedRules(), seededRng(seed));
      g.makeClaim(parseRank(claim));
      if (new Bot({ rng: seededRng(seed + 1000), level }).play(g) !== null) pulls++;
    }
    return pulls / trials;
  };

  it("gets more patient as the level rises", () => {
    // "three 3" is true about 16% of the time; "pair 6" about 52%.
    expect(pullRate("easy", "three 3")).toBeGreaterThan(0.9);
    expect(pullRate("stabby", "three 3")).toBeLessThan(0.1);
    // Easy is jumpy: it pulls an even-odds claim a good fraction of the time. Normal doesn't.
    expect(pullRate("easy", "pair 6")).toBeGreaterThan(0.2);
    expect(pullRate("normal", "pair 6")).toBeLessThan(0.1);
    expect(pullRate("easy", "three 3")).toBeGreaterThan(pullRate("normal", "three 3"));
    expect(pullRate("normal", "three 3")).toBeGreaterThan(pullRate("stabby", "three 3"));
  });

  /** Win rate of level `a` against level `b` over two-player games, alternating seats and rules. */
  const winRate = (a: BotLevel, b: BotLevel, games = 150) => {
    let wins = 0;
    for (let seed = 0; seed < games; seed++) {
      const rules = seed % 4 < 2 ? basicRules() : advancedRules();
      const g = new Game(["A", "B"], rules, seededRng(seed), seed % 2);
      const bots = [
        new Bot({ rng: seededRng(seed * 2 + 1), level: a }),
        new Bot({ rng: seededRng(seed * 2 + 2), level: b }),
      ];
      for (let turns = 0; turns < 5000 && g.winner === null; turns++) bots[g.current]!.play(g);
      if (g.winner === 0) wins++;
    }
    return wins / games;
  };

  it("makes higher levels genuinely stronger", () => {
    expect(winRate("normal", "easy")).toBeGreaterThan(0.6);
    expect(winRate("stabby", "normal")).toBeGreaterThan(0.55);
    expect(winRate("stabby", "easy")).toBeGreaterThan(0.7);
  });

  it("takes a turn one visible move at a time, ending the same way play() does", () => {
    for (const rules of [basicRules(), advancedRules()]) {
      for (let seed = 0; seed < 30; seed++) {
        const whole = new Game(["A", "B"], rules, seededRng(seed));
        const stepped = new Game(["A", "B"], rules, seededRng(seed));
        new Bot({ rng: seededRng(seed + 1) }).play(whole);

        const bot = new Bot({ rng: seededRng(seed + 1) });
        const said: string[] = [];
        let outcome = bot.step(stepped, (t) => said.push(t));
        let moves = 1;
        while (outcome.kind === "acted") {
          outcome = bot.step(stepped, (t) => said.push(t));
          moves++;
        }
        expect(outcome.kind).toBe("claimed");
        expect(moves).toBeGreaterThanOrEqual(2); // at least the roll and the claim
        expect(said).toHaveLength(moves); // every step is narrated, so it is worth pausing on
        expect(stepped.claim).toEqual(whole.claim);
        expect(stepped.dice).toEqual(whole.dice);
      }
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

describe("randomBotLevel", () => {
  it("only ever returns a real level", () => {
    const rng = seededRng(3);
    for (let i = 0; i < 200; i++) expect(BOT_LEVEL_NAMES).toContain(randomBotLevel(rng));
  });

  it("reaches every level, each about a third of the time", () => {
    const rng = seededRng(11);
    const counts = new Map<string, number>();
    const draws = 3000;
    for (let i = 0; i < draws; i++) {
      const level = randomBotLevel(rng);
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([...BOT_LEVEL_NAMES].sort());
    for (const count of counts.values()) expect(count / draws).toBeGreaterThan(0.28);
  });

  it("repeats for the same seed", () => {
    const draw = (seed: number) => Array.from({ length: 12 }, ((rng) => () => randomBotLevel(rng))(seededRng(seed)));
    expect(draw(5)).toEqual(draw(5));
    expect(draw(5)).not.toEqual(draw(6));
  });

  it("works with the default random source", () => {
    expect(BOT_LEVEL_NAMES).toContain(randomBotLevel());
  });
});

describe("how rolls read in a log", () => {
  it("calls the only roll of basic play the cup, and names the set in advanced play", () => {
    expect(rollPhrase(basicRules(), "hidden")).toBe("the cup");
    expect(rollPhrase(advancedRules(), "hidden")).toBe("the hidden set");
    expect(rollPhrase(advancedRules(), "visible")).toBe("the visible set");
  });

  it.each([
    ["basic", basicRules(), "rolls the cup", "rolls the hidden set"],
    ["advanced", advancedRules(), "rolls the hidden set", "rolls the cup"],
  ])("makes a bot say it in %s play", (_name, rules, expected, unexpected) => {
    const lines: string[] = [];
    for (let seed = 0; seed < 10; seed++) {
      const g = new Game(["A", "B"], rules, seededRng(seed));
      const bots = [0, 1].map((i) => new Bot({ rng: seededRng(seed * 10 + i) }));
      for (let turns = 0; turns < 400 && g.winner === null; turns++) bots[g.current]!.step(g, (text) => lines.push(text));
    }
    expect(lines).toContain(expected);
    expect(lines).not.toContain(unexpected);
  });
});
