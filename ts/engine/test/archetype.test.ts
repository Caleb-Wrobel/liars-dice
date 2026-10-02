import { describe, expect, it } from "vitest";
import {
  BOT_LEVELS,
  Bot,
  Game,
  LADDER,
  advancedRules,
  basicRules,
  sameRank,
  seededRng,
  type Archetype,
  type Habits,
} from "../src/index.ts";

const archetypeWith = (habits: Habits): Archetype => ({
  id: "test",
  name: "Test",
  brief: "",
  habits,
});

interface Turn {
  readonly lines: readonly string[];
  /** Index of the standing claim on the ladder, -1 when opening a round. */
  readonly standing: number;
  /** Index of the claim the bot made, or null if it pulled. */
  readonly claim: number | null;
}

/** Plays whole two-bot games and records every bot turn. */
function play(advanced: boolean, makeBots: (seed: number) => [Bot, Bot], games = 40): Turn[] {
  const turns: Turn[] = [];
  for (let seed = 0; seed < games; seed++) {
    const game = new Game(["A", "B"], advanced ? advancedRules() : basicRules(), seededRng(seed));
    const bots = makeBots(seed);
    for (let n = 0; n < 3000 && game.winner === null; n++) {
      const standing = LADDER.findIndex((r) => sameRank(r, game.claim));
      const lines: string[] = [];
      const pulled = bots[game.current]!.play(game, (line) => lines.push(line));
      turns.push({
        lines,
        standing,
        claim: pulled ? null : LADDER.findIndex((r) => sameRank(r, game.claim)),
      });
    }
    expect(game.winner, `seed ${seed} did not finish`).not.toBeNull();
  }
  return turns;
}

const botsWith = (archetype?: Archetype) => (seed: number): [Bot, Bot] => [
  new Bot({ rng: seededRng(seed * 2 + 1), archetype }),
  new Bot({ rng: seededRng(seed * 2 + 2), archetype }),
];

const said = (turn: Turn, start: string) => turn.lines.some((line) => line.startsWith(start));

describe("archetype habits", () => {
  it("do nothing when empty, so a bot plays exactly as it did without one", () => {
    for (const advanced of [false, true]) {
      const plain = play(advanced, botsWith());
      const empty = play(advanced, botsWith(archetypeWith({})));
      expect(empty).toEqual(plain);
    }
  });

  it("leave the level's strength settings alone", () => {
    const bot = new Bot({ level: "stabby", archetype: archetypeWith({ bluff: [1], sandbag: [0], rearrange: 0 }) });
    expect(bot.style.pullBelow).toBe(BOT_LEVELS.stabby.pullBelow);
    expect(bot.style.noise).toBe(BOT_LEVELS.stabby.noise);
    expect(bot.style.samples).toBe(BOT_LEVELS.stabby.samples);
    expect(bot.style.bluff).toEqual([1]);
    expect(bot.style.sandbag).toEqual([0]);
  });

  describe("rearrange", () => {
    it("never rearranges at 0", () => {
      for (const advanced of [false, true]) {
        const turns = play(advanced, botsWith(archetypeWith({ rearrange: 0 })));
        expect(turns.some((t) => said(t, "rearranges"))).toBe(false);
      }
    });

    it("always rearranges after peering at 1", () => {
      for (const advanced of [false, true]) {
        const turns = play(advanced, botsWith(archetypeWith({ rearrange: 1 })));
        const peered = turns.filter((t) => said(t, "peers"));
        expect(peered.length).toBeGreaterThan(10);
        expect(peered.every((t) => said(t, "rearranges"))).toBe(true);
      }
    });
  });

  describe("gambleRoll", () => {
    // Turns where the bot pulled the cup have no roll to skip, so look at the turns that ended in a claim.
    const claimTurns = (turns: Turn[]) => turns.filter((t) => t.claim !== null);

    it("skips the roll in advanced play, which the log shows as keeping the dice", () => {
      const turns = claimTurns(play(true, botsWith(archetypeWith({ gambleRoll: 1 }))));
      expect(turns.length).toBeGreaterThan(20);
      expect(turns.some((t) => said(t, "rolls"))).toBe(false);
      expect(turns.every((t) => said(t, "keeps the dice as they are"))).toBe(true);
    });

    it("cannot skip a roll that basic rules require", () => {
      const turns = claimTurns(play(false, botsWith(archetypeWith({ gambleRoll: 1 }))));
      expect(turns.length).toBeGreaterThan(20);
      expect(turns.every((t) => said(t, "rolls the hidden set"))).toBe(true);
    });
  });

  describe("blindClaim", () => {
    // A distinctive bluff size makes a blind claim recognisable: it is always the standing claim plus 2.
    const blind = archetypeWith({ blindClaim: 1, bluff: [2] });

    it("sizes a claim without using the dice it has not looked at", () => {
      // A bot that peers at the start of its turn knows its dice, so if it keeps them it may claim from
      // them. The blind case is a turn where it rolled and then did not look.
      const claims = play(true, botsWith(blind)).filter(
        (t) => t.claim !== null && t.standing >= 0 && said(t, "rolls"),
      );
      expect(claims.length).toBeGreaterThan(20);
      for (const t of claims) {
        expect(t.claim).toBe(Math.min(t.standing + 2, LADDER.length - 1));
      }
    });

    it("still looks at the dice when it opens a round, since there is nothing to size up", () => {
      const openers = play(true, botsWith(blind)).filter((t) => t.standing < 0 && t.claim !== null);
      expect(openers.length).toBeGreaterThan(5);
      expect(openers.some((t) => t.claim !== 1)).toBe(true); // not simply nil plus 2
    });

    it("is ignored when basic rules require a peek", () => {
      const claims = play(false, botsWith(blind)).filter((t) => t.claim !== null && t.standing >= 0);
      expect(claims.some((t) => t.claim !== Math.min(t.standing + 2, LADDER.length - 1))).toBe(true);
    });
  });

  it("let a bot with every habit turned up finish legal games under both rules", () => {
    const wild = archetypeWith({ bluff: [12], sandbag: [6], rearrange: 1, gambleRoll: 1, blindClaim: 1 });
    play(false, botsWith(wild));
    play(true, botsWith(wild));
  });
});
