import { describe, expect, it } from "vitest";
import {
  BOT_LEVEL_NAMES,
  Bot,
  CAST,
  Game,
  advancedRules,
  basicRules,
  seededRng,
  type BotLevel,
  type Personality,
} from "../src/index.ts";

/**
 * A personality must not change how strong a bot is. Strength belongs to the level, so a character
 * and a level stay independent. Each character plays plain bots of the same level, in basic and
 * advanced games, taking turns to open and to sit first.
 *
 * Two bots with identical settings split about 50/50. The bounds are set well inside the gap between
 * adjacent levels, where Normal beats Easy about 75% and Stabby beats Normal about 62%, so a character
 * that drifts toward being a different level fails. Measured at 500 games per cell, the whole cast sits
 * between 43% and 58%.
 *
 * It takes about a minute, because a Stabby bot simulates hundreds of hands for every decision, so it runs
 * with `npm run test:slow` and not with the everyday suite. Run it before a pull request that changes the bot,
 * the cast or the personality habits.
 */
const GAMES = 240;
const LOW = 0.38;
const HIGH = 0.62;

function winRate(level: BotLevel, personality: Personality, games: number): number {
  let wins = 0;
  for (let seed = 0; seed < games; seed++) {
    const personalitySeat = seed % 2;
    const opener = (seed >> 1) % 2;
    const rules = (seed >> 2) % 2 === 1 ? advancedRules() : basicRules();
    const game = new Game(["A", "B"], rules, seededRng(seed), opener);
    const withPersonality = new Bot({ rng: seededRng(1000 + seed * 2), level, personality });
    const plain = new Bot({ rng: seededRng(2000 + seed * 2), level });
    const bots = personalitySeat === 0 ? [withPersonality, plain] : [plain, withPersonality];
    for (let turn = 0; turn < 4000 && game.winner === null; turn++) bots[game.current]!.play(game);
    if (game.winner === personalitySeat) wins++;
  }
  return wins / games;
}

describe("a personality leaves a bot's strength to its level", () => {
  describe.each(CAST.map((p) => [p.name, p] as const))("%s", (_name, personality) => {
    it.each(BOT_LEVEL_NAMES)("plays about as well as a plain %s bot", (level) => {
      const rate = winRate(level, personality, GAMES);
      expect(rate).toBeGreaterThan(LOW);
      expect(rate).toBeLessThan(HIGH);
    }, 120_000);
  });

  it("would notice a personality that did change strength", () => {
    // A guard that cannot fail proves nothing. A bot that bluffs by 40 rungs every time is far weaker.
    const reckless: Personality = {
      id: "reckless",
      name: "Reckless",
      archetype: "The Reckless",
      bio: "",
      habits: { bluff: [40], sandbag: [6] },
    };
    expect(winRate("normal", reckless, GAMES)).toBeLessThan(LOW);
  }, 120_000);
});
