import { describe, expect, it } from "vitest";
import {
  Bot,
  Game,
  NUM_DICE,
  Step,
  advancedRules,
  basicRules,
  seededRng,
  view,
  type BotLevel,
  type Rules,
} from "../src/index.ts";

/** A face no die can show, so it can only appear in a view if a hidden die leaked. */
const SENTINEL = 777;
const LEVELS: readonly BotLevel[] = ["easy", "normal", "stabby"];

/** Plays a whole game with bots in every seat, calling `onState` before each move and once at the end. */
function playGame(rules: Rules, players: number, seed: number, onState: (g: Game) => void): Game {
  const g = new Game(
    Array.from({ length: players }, (_, i) => String.fromCharCode(65 + i)),
    rules,
    seededRng(seed * 31 + players),
    "random",
  );
  const bots = Array.from(
    { length: players },
    (_, i) => new Bot({ level: LEVELS[(seed + i) % LEVELS.length]!, rng: seededRng(seed * 13 + i) }),
  );
  for (let moves = 0; moves < 3000; moves++) {
    onState(g);
    if (g.winner !== null) return g;
    bots[g.current]!.step(g);
  }
  throw new Error("the game did not finish");
}

/**
 * How many seeds each table shape gets. A bigger net is cheap on a big machine, but the engine's 30 s test timeout
 * would cut it short, so lift that too: VIEW_SEEDS=1000 npx vitest run test/view.test.ts --testTimeout=0
 * (1000 seeds takes a few minutes).
 */
const SEEDS = Number((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VIEW_SEEDS) || 12;

/** Every table shape and rule set, over many seeds. */
function everyState(onState: (g: Game) => void, seeds = SEEDS) {
  for (const rules of [basicRules(2), advancedRules(2)]) {
    for (const players of [2, 3, 6]) {
      for (let seed = 0; seed < seeds; seed++) playGame(rules, players, seed, onState);
    }
  }
}

/** Only numbers, strings, booleans and null, in arrays and plain objects: no Sets, Maps, functions or class instances. */
function isPlain(x: unknown): boolean {
  if (x === null || ["number", "string", "boolean"].includes(typeof x)) return true;
  if (Array.isArray(x)) return x.every(isPlain);
  if (typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype) return Object.values(x).every(isPlain);
  return false;
}

const seats = (g: Game) => g.names.map((_, i) => i);
/** The dice this seat may not see: not in the visible set, and not seen by the current player. */
const unseenBy = (g: Game, seat: number) =>
  Array.from({ length: NUM_DICE }, (_, i) => i).filter(
    (i) => !g.visible.has(i) && !(seat === g.current && g.known.has(i)),
  );

describe("view: what a seat may see", () => {
  it("never shows a seat a die it has not seen, anywhere in the view", () => {
    let states = 0;
    let withUnseen = 0;
    everyState((g) => {
      const real = [...g.dice];
      for (const seat of seats(g)) {
        const unseen = unseenBy(g, seat);
        for (const i of unseen) g.dice[i] = SENTINEL;
        const v = view(g, seat);
        g.dice.splice(0, NUM_DICE, ...real);
        expect(JSON.stringify(v)).not.toContain(String(SENTINEL));
        for (const i of unseen) expect(v.dice[i]).toBeNull();
        withUnseen += unseen.length > 0 ? 1 : 0;
      }
      states++;
    });
    expect(states).toBeGreaterThan(1500); // the property is not vacuous
    expect(withUnseen).toBeGreaterThan(1500);
  });

  it("shows the visible set to everyone, and the current player the dice they have seen", () => {
    let sawVisible = 0;
    let sawOwn = 0;
    everyState((g) => {
      for (const seat of seats(g)) {
        const v = view(g, seat);
        for (let i = 0; i < NUM_DICE; i++) {
          const shown = g.visible.has(i) || (seat === g.current && g.known.has(i));
          expect(v.dice[i]).toBe(shown ? g.dice[i]! : null);
          if (g.visible.has(i)) sawVisible++;
          else if (shown) sawOwn++;
        }
        expect(v.visible).toEqual([...g.visible].sort((a, b) => a - b));
      }
    });
    expect(sawVisible).toBeGreaterThan(0);
    expect(sawOwn).toBeGreaterThan(0);
  });

  it("does not change for a seat when the dice it cannot see change", () => {
    const rng = seededRng(99);
    everyState((g) => {
      for (const seat of seats(g)) {
        const before = JSON.stringify(view(g, seat));
        const real = [...g.dice];
        for (const i of unseenBy(g, seat)) g.dice[i] = 1 + Math.floor(rng() * 6);
        const after = JSON.stringify(view(g, seat));
        g.dice.splice(0, NUM_DICE, ...real);
        expect(after).toBe(before);
      }
    }, 4);
  });

  it("offers actions only to the current seat while the game is on", () => {
    everyState((g) => {
      for (const seat of seats(g)) {
        const v = view(g, seat);
        const mine = seat === g.current && g.winner === null;
        expect(v.available).toEqual(mine ? g.available() : []);
      }
    }, 4);
  });

  it("says who won, offers nothing, and still hides the dice once the game is over", () => {
    for (let seed = 0; seed < 6; seed++) {
      const g = playGame(basicRules(1), 3, seed, () => {});
      for (const seat of seats(g)) {
        const v = view(g, seat);
        expect(v.winner).toBe(g.winner);
        expect(v.available).toEqual([]);
        expect(v.lives).toEqual([...g.lives]);
      }
    }
  });
});

describe("view: plain data", () => {
  it("survives JSON unchanged, with only plain values inside", () => {
    everyState((g) => {
      for (const seat of seats(g)) {
        const v = view(g, seat);
        expect(JSON.parse(JSON.stringify(v))).toEqual(v);
        expect(isPlain(v)).toBe(true);
      }
    }, 3);
  });

  it("carries the public state: seat, names, lives, turn, step, claim, claimer and rules", () => {
    const g = new Game(["A", "B", "C"], advancedRules(4), seededRng(3));
    g.roll();
    g.peek();
    g.makeClaim({ category: 1, faces: [4], kicker: 0 });
    const v = view(g, 2);
    expect(v).toMatchObject({
      you: 2,
      names: ["A", "B", "C"],
      lives: [4, 4, 4],
      current: 1,
      step: Step.Decide,
      claim: { category: 1, faces: [4], kicker: 0 },
      claimer: 0,
      rules: advancedRules(4),
      winner: null,
    });
  });

  it("copies what it reads, so changing a view can never reach back into the game", () => {
    const g = new Game(["A", "B"], advancedRules(), seededRng(8));
    g.roll();
    g.peek();
    g.makeClaim({ category: 2, faces: [5, 3], kicker: 0 });
    const v = view(g, 0) as { -readonly [K in keyof ReturnType<typeof view>]: ReturnType<typeof view>[K] };
    const snapshot = JSON.stringify({ names: g.names, lives: g.lives, claim: g.claim, rules: g.rules, visible: [...g.visible] });
    (v.names as string[]).push("X");
    (v.lives as number[])[0] = 99;
    (v.claim.faces as number[]).push(9);
    (v.rules.rollable as string[]).push("nonsense");
    (v.dice as (number | null)[])[0] = 5;
    (v.visible as number[]).push(4);
    expect(JSON.stringify({ names: g.names, lives: g.lives, claim: g.claim, rules: g.rules, visible: [...g.visible] })).toBe(snapshot);
  });

  it("refuses a seat that does not exist", () => {
    const g = new Game(["A", "B"], basicRules(), seededRng(1));
    for (const bad of [-1, 2, 1.5, NaN]) expect(() => view(g, bad)).toThrow(RangeError);
  });
});
