import { describe, expect, it } from "vitest";
import {
  Game,
  NIL,
  NUM_DICE,
  RuleError,
  Step,
  advancedRules,
  basicRules,
  formatRank,
  parseRank,
  seededRng,
  type Rules,
} from "../src/index.ts";

const make = (names = ["A", "B", "C"], rules: Rules = basicRules()) =>
  new Game(names, rules, seededRng(1));

const setDice = (g: Game, dice: number[]) => g.dice.splice(0, NUM_DICE, ...dice);

/** Have the current player open with `claim`, then force the dice. */
function openWith(g: Game, claim: string, dice?: number[]) {
  if (!g.rules.rollOptional) g.roll();
  if (!g.rules.peekOptional) g.peek();
  g.makeClaim(parseRank(claim));
  if (dice) setDice(g, dice);
}

const all = [0, 1, 2, 3, 4];

describe("the opening turn", () => {
  it("starts with a nil claim and the opener at roll", () => {
    const g = make();
    expect(g.claim).toEqual(NIL);
    expect(g.step).toBe(Step.Roll);
    expect(g.visible.size).toBe(0);
    expect(g.known.size).toBe(0);
    expect(g.available()).toEqual(["roll"]); // basic: peeking before the roll would strand you
  });

  it("can't be stranded by peeking before a mandatory roll", () => {
    const g = make();
    expect(() => g.peek()).toThrow(RuleError);
    expect(g.step).toBe(Step.Roll);
    expect(g.available()).toEqual(["roll"]); // still free to roll
    g.roll();
    expect(g.available()).toEqual(["peek"]);
  });

  it("lets advanced players peek before rolling", () => {
    const g = make(["A", "B", "C"], advancedRules());
    expect(g.available()).toEqual(["roll", "peek", "claim"]);
    g.peek();
  });

  it("cannot pull, peer or rearrange", () => {
    const g = make();
    expect(() => g.pull()).toThrow(RuleError);
    expect(() => g.peer()).toThrow(RuleError);
    expect(() => g.rearrange([0])).toThrow(RuleError);
  });

  it("must beat nil", () => {
    const g = make(["A", "B", "C"], advancedRules());
    g.makeClaim(parseRank("none 1")); // the lowest legal claim
  });
});

describe("turn order and the basic/advanced switches", () => {
  it("basic requires roll and peek before claiming", () => {
    const g = make();
    expect(() => g.makeClaim(parseRank("pair 1"))).toThrow(RuleError);
    g.roll();
    expect(() => g.makeClaim(parseRank("pair 1"))).toThrow(RuleError);
    g.peek();
    g.makeClaim(parseRank("pair 1"));
    expect(g.current).toBe(1);
    expect(g.step).toBe(Step.Decide);
  });

  it("basic rolls only hidden dice", () => {
    const g = make();
    openWith(g, "pair 1", [1, 1, 1, 1, 1]);
    g.peer();
    g.rearrange([0, 1]);
    expect(() => g.roll("visible")).toThrow(RuleError);
    g.roll("hidden");
    expect(g.dice.slice(0, 2)).toEqual([1, 1]);
  });

  it("advanced can skip roll and peek", () => {
    const g = make(["A", "B", "C"], advancedRules());
    g.makeClaim(parseRank("pair 6")); // opener claims blind
    g.peer();
    g.makeClaim(parseRank("five 6")); // bluff without rolling or peeking
  });

  it("advanced can roll visible and keep hidden", () => {
    const g = make(["A", "B", "C"], advancedRules());
    g.makeClaim(parseRank("pair 1"));
    setDice(g, [6, 6, 6, 6, 6]);
    g.peer();
    g.rearrange([0, 1]);
    g.roll("visible");
    expect(g.dice.slice(2)).toEqual([6, 6, 6]);
  });

  it("treats rolling an empty set as electing not to roll", () => {
    const g = make(["A", "B", "C"], advancedRules());
    g.makeClaim(parseRank("pair 1"));
    setDice(g, [1, 2, 3, 4, 5]);
    g.peer();
    g.rearrange(all); // every die visible, hidden set empty
    g.roll("hidden");
    expect(g.dice).toEqual([1, 2, 3, 4, 5]);
  });

  it("basic cannot leave nothing to roll", () => {
    const g = make();
    openWith(g, "pair 1");
    g.peer();
    expect(() => g.rearrange(all)).toThrow(RuleError); // would force a skipped roll
    g.rearrange([0, 1, 2, 3]); // one hidden die is enough
  });

  it("keeps the turn order fixed", () => {
    const g = make(["A", "B", "C"], advancedRules());
    g.makeClaim(parseRank("pair 1"));
    g.peer();
    g.roll();
    expect(() => g.rearrange([])).toThrow(RuleError); // too late
    g.peek();
    expect(() => g.roll()).toThrow(RuleError);
  });

  it("must peer before arranging, and peering forbids pulling", () => {
    const g = make();
    openWith(g, "pair 1");
    expect(() => g.roll()).toThrow(RuleError);
    g.peer();
    expect(() => g.pull()).toThrow(RuleError);
  });

  it("requires a claim to strictly beat the standing claim", () => {
    const g = make(["A", "B", "C"], advancedRules());
    g.makeClaim(parseRank("pair 3"));
    g.peer();
    for (const bad of ["pair 3", "pair 2", "none 6"]) {
      expect(() => g.makeClaim(parseRank(bad))).toThrow(RuleError);
    }
    g.makeClaim(parseRank("pair 3 1")); // a kicker beats no kicker
  });

  it("cannot peer after the top claim", () => {
    const g = make(["A", "B", "C"], advancedRules());
    g.makeClaim(parseRank("five 6"));
    expect(g.canPeer).toBe(false);
    expect(g.available()).toEqual(["pull"]);
    expect(() => g.peer()).toThrow(RuleError);
  });
});

describe("what the player has seen", () => {
  it("follows peers, rolls and peeks", () => {
    const g = make();
    g.roll();
    expect(g.known.size).toBe(0); // rolled hidden dice are unseen
    g.peek();
    expect([...g.known].sort()).toEqual(all);
    g.makeClaim(parseRank("pair 1"));
    expect(g.known).toEqual(g.visible);
    expect(g.known.size).toBe(0); // next player sees nothing hidden
    g.peer();
    expect([...g.known].sort()).toEqual(all);
  });

  it("hides rolled hidden dice again", () => {
    const g = make(["A", "B", "C"], advancedRules());
    g.makeClaim(parseRank("pair 1"));
    g.peer();
    g.rearrange([0, 1]);
    g.roll("hidden");
    expect([...g.known].sort()).toEqual([0, 1]);
  });
});

describe("pulling", () => {
  it("costs the puller a life when the claim is true", () => {
    const g = make();
    openWith(g, "pair 3", [3, 3, 1, 2, 5]);
    const r = g.pull();
    expect(r.claimTrue).toBe(true);
    expect(r.loser).toBe(1);
    expect(g.lives).toEqual([3, 2, 3]);
  });

  it("treats a claim as at least, not exactly", () => {
    const g = make();
    openWith(g, "pair 2", [6, 6, 6, 1, 2]);
    expect(g.pull().claimTrue).toBe(true);
  });

  it("requires the kicker to be met", () => {
    const g = make();
    openWith(g, "pair 2 5", [2, 2, 3, 4, 1]); // kicker is only 4
    const r = g.pull();
    expect(r.claimTrue).toBe(false);
    expect(r.loser).toBe(0);
  });

  it("lets the claimed kicker be lower than the highest held", () => {
    const g = make();
    openWith(g, "pair 2 4", [2, 2, 5, 1, 3]); // holding a 5 kicker, claims a 4
    const r = g.pull();
    expect(r.claimTrue).toBe(true);
    expect(r.loser).toBe(1);
  });

  it("reveals the highest leftover die as the kicker", () => {
    const g = make();
    openWith(g, "three 4 2", [4, 4, 4, 3, 1]); // revealed: three 4s and a 3
    const r = g.pull();
    expect(formatRank(r.revealed)).toBe("three 4s and a 3");
    expect(r.claimTrue).toBe(true);
    expect(r.loser).toBe(1);
  });

  it("ignores the kicker when the claim has none", () => {
    const g = make();
    openWith(g, "pair 2", [2, 2, 3, 4, 1]);
    expect(g.pull().claimTrue).toBe(true);
  });

  it("costs the claimer a life when the claim is false", () => {
    const g = make();
    openWith(g, "five 6", [1, 2, 3, 4, 6]);
    const r = g.pull();
    expect(r.claimTrue).toBe(false);
    expect(r.loser).toBe(0);
    expect(g.lives).toEqual([2, 3, 3]);
  });
});

describe("rounds and elimination", () => {
  it("opens the next round with the player after the puller", () => {
    const g = make();
    openWith(g, "five 6", [1, 2, 3, 4, 6]); // A claims, B pulls, A loses
    g.pull();
    expect(g.current).toBe(2);
    expect(g.claim).toEqual(NIL);
    expect(g.step).toBe(Step.Roll);
  });

  it("opens after the puller even when the puller loses", () => {
    const g = make();
    openWith(g, "pair 1", [1, 1, 3, 4, 6]); // truthful; B pulls and loses
    g.pull();
    expect(g.lives[1]).toBe(2);
    expect(g.current).toBe(2);
  });

  it("ends with the last player standing", () => {
    const g = make(["A", "B"], basicRules(1));
    openWith(g, "five 6", [1, 2, 3, 4, 6]);
    g.pull();
    expect(g.winner).toBe(1);
    expect(g.lives).toEqual([0, 1]);
  });

  it("hands the opening to the next survivor when the puller is eliminated", () => {
    const g = make();
    g.lives = [3, 1, 3];
    openWith(g, "pair 1", [1, 1, 3, 4, 6]); // B pulls and is out
    const r = g.pull();
    expect(r.eliminated).toBe(true);
    expect(g.current).toBe(2);
    g.roll();
    g.peek();
    g.makeClaim(parseRank("pair 2"));
    expect(g.current).toBe(0); // B is skipped
  });
});
