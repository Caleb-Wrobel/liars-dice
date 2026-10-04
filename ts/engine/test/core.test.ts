import { describe, expect, it } from "vitest";
import {
  Bot,
  Core,
  Game,
  LADDER,
  advancedRules,
  basicRules,
  parseIntent,
  seededRng,
  view,
  type BotLevel,
  type GameEvent,
  type Rules,
} from "../src/index.ts";

const LEVELS: readonly BotLevel[] = ["easy", "normal", "stabby"];
const names = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));

function setup(rules: Rules, players: number, seed: number) {
  const game = new Game(names(players), rules, seededRng(seed * 31 + players), "random");
  const bots = Array.from(
    { length: players },
    (_, i) => new Bot({ level: LEVELS[(seed + i) % LEVELS.length]!, rng: seededRng(seed * 13 + i) }),
  );
  return { game, core: new Core(game), bots };
}

/** Everything that makes one game state differ from another. */
const snapshot = (g: Game) =>
  JSON.stringify({
    dice: g.dice,
    visible: [...g.visible],
    known: [...g.known],
    lives: g.lives,
    current: g.current,
    claim: g.claim,
    claimer: g.claimer,
    rolled: g.rolled,
    peeked: g.peeked,
    step: g.step,
  });

/** Plays a whole game through the core, bots in every seat. */
function playThroughCore(rules: Rules, players: number, seed: number) {
  const { game, core, bots } = setup(rules, players, seed);
  const events: GameEvent[] = [];
  for (let moves = 0; moves < 3000 && game.winner === null; moves++) {
    const res = core.stepBot(game.current, bots[game.current]!);
    if (!res.ok) throw new Error(res.error);
    events.push(...res.events);
  }
  return { game, events };
}

/** The same game with the bots acting on the Game directly. */
function playDirectly(rules: Rules, players: number, seed: number) {
  const { game, bots } = setup(rules, players, seed);
  for (let moves = 0; moves < 3000 && game.winner === null; moves++) bots[game.current]!.step(game);
  return game;
}

const SHAPES: readonly [Rules, number][] = [
  [basicRules(2), 2],
  [advancedRules(2), 3],
  [basicRules(2), 6],
  [advancedRules(3), 4],
];

describe("Core: playing through intents", () => {
  it("plays bots through the core exactly as the bots play on the game directly", () => {
    for (const [rules, players] of SHAPES) {
      for (let seed = 0; seed < 8; seed++) {
        const viaCore = playThroughCore(rules, players, seed).game;
        const direct = playDirectly(rules, players, seed);
        expect(snapshot(viaCore)).toBe(snapshot(direct));
        expect(viaCore.winner).toBe(direct.winner);
      }
    }
  });

  it("tells the table every round and ends with exactly one winner", () => {
    for (const [rules, players] of SHAPES) {
      for (let seed = 0; seed < 8; seed++) {
        const { game, events } = playThroughCore(rules, players, seed);
        const pulls = events.filter((e) => e.type === "pulled");
        const lost = game.lives.reduce((sum, lives) => sum + (rules.lives - lives), 0);
        expect(pulls).toHaveLength(lost);
        expect(events.filter((e) => e.type === "won")).toEqual([{ type: "won", seat: game.winner! }]);
        expect(events.at(-1)).toEqual({ type: "won", seat: game.winner! });
        // Every pull is followed by the next round or the win.
        events.forEach((e, i) => {
          if (e.type === "pulled") expect(["round", "won"]).toContain(events[i + 1]!.type);
        });
      }
    }
  });

  it("replays identically for the same seed", () => {
    const a = playThroughCore(advancedRules(2), 4, 5).events;
    const b = playThroughCore(advancedRules(2), 4, 5).events;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("gives every seat its own view after a move, and the actor sees what they peered at", () => {
    const { game, core } = setup(advancedRules(), 3, 4);
    const actor = game.current;
    expect(core.apply(actor, { action: "roll" }).ok).toBe(true);
    const res = core.apply(actor, { action: "peek" });
    if (!res.ok) throw new Error(res.error);
    expect(res.views).toHaveLength(3);
    res.views.forEach((v, seat) => {
      expect(v).toEqual(view(game, seat));
      expect(v.you).toBe(seat);
    });
    expect(res.views[actor]!.dice.every((d) => d !== null)).toBe(true); // peeked: all five known
    res.views.forEach((v, seat) => {
      if (seat !== actor) expect(v.dice.every((d) => d === null)).toBe(true); // nothing visible, so nothing shown
    });
  });
});

describe("Core: turning moves away", () => {
  it("refuses a seat that is not on turn, a seat that does not exist, and any move once the game is over", () => {
    const { game, core } = setup(basicRules(), 3, 2);
    const other = (game.current + 1) % 3;
    expect(core.apply(other, { action: "roll" })).toEqual({ ok: false, error: "it is not your turn" });
    for (const bad of [-1, 3, 99, 1.5, NaN]) {
      expect(core.apply(bad, { action: "roll" })).toEqual({ ok: false, error: "there is no such seat" });
    }
    const over = playThroughCore(basicRules(1), 2, 1);
    const finished = new Core(over.game);
    for (const seat of [0, 1]) expect(finished.apply(seat, { action: "pull" })).toEqual({ ok: false, error: "the game is over" });
  });

  it("refuses what is not shaped like a move, without throwing", () => {
    const { game, core } = setup(advancedRules(), 2, 3);
    const seat = game.current;
    const before = snapshot(game);
    const junk: unknown[] = [
      null, undefined, 5, "pull", [], {}, { action: "hack" }, { action: 7 },
      { action: "rearrange" }, { action: "rearrange", visible: "abc" }, { action: "rearrange", visible: [1, "2"] },
      { action: "rearrange", visible: [0, 1, 2, 3, 4, 5] }, { action: "rearrange", visible: [0.5] },
      { action: "roll", set: "cup" }, { action: "roll", set: 3 },
      { action: "claim" }, { action: "claim", rank: null }, { action: "claim", rank: 7 },
      { action: "claim", rank: { category: "pair", faces: [], kicker: 0 } },
      { action: "claim", rank: { category: 1, faces: "5", kicker: 0 } },
      { action: "claim", rank: { category: 1, faces: [1, 2, 3], kicker: 0 } },
      { action: "claim", rank: { category: 1, faces: [5], kicker: 1.5 } },
      { action: "claim", rank: { category: 1, faces: [NaN], kicker: 0 } },
    ];
    for (const move of junk) {
      expect(core.apply(seat, move)).toEqual({ ok: false, error: "that is not a move" });
      expect(snapshot(game)).toBe(before);
    }
    expect(parseIntent({ action: "claim", rank: LADDER[3] })).toEqual({ action: "claim", rank: LADDER[3] });
  });

  it("leaves the game untouched whenever a move is refused, and answers every move without throwing", () => {
    const rng = seededRng(7);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]!;
    const wild = () =>
      pick<unknown>([
        { action: "pull" }, { action: "peer" }, { action: "peek" }, { action: "roll" },
        { action: "roll", set: "visible" }, { action: "roll", set: "hidden" },
        { action: "rearrange", visible: [] }, { action: "rearrange", visible: [0, 1, 2, 3, 4] },
        { action: "rearrange", visible: [pick([0, 1, 2, 3, 4, 5, -1, 9])] },
        { action: "rearrange", visible: [pick([0, 1, 2]), pick([2, 3, 4])] },
        { action: "claim", rank: pick(LADDER) }, { action: "claim", rank: { category: 1, faces: [9], kicker: 0 } },
        { action: "claim", rank: { category: 9, faces: [], kicker: 0 } }, { action: "nonsense" }, null, 3,
      ]);
    let refused = 0;
    let accepted = 0;
    for (const [rules, players] of SHAPES) {
      for (let seed = 0; seed < 6; seed++) {
        const { game, core } = setup(rules, players, seed);
        for (let i = 0; i < 1200 && game.winner === null; i++) {
          if (i % 4 === 3) {
            // Keep the game moving with a bot that has just taken the seat over. A fresh Bot starts at the top of its
            // turn, which is what a takeover would use: one that remembered an earlier turn would be confused by the
            // moves made under it.
            const takeover = new Bot({ rng: seededRng(seed * 1000 + i) });
            expect(core.stepBot(game.current, takeover).ok).toBe(true);
            continue;
          }
          const seat = rng() < 0.8 ? game.current : Math.floor(rng() * (players + 1)) - 1;
          const before = snapshot(game);
          const res = core.apply(seat, wild());
          if (res.ok) {
            accepted++;
            expect(res.events.length).toBeGreaterThan(0);
            expect(res.views).toHaveLength(players);
          } else {
            refused++;
            expect(typeof res.error).toBe("string");
            expect(snapshot(game)).toBe(before);
          }
        }
      }
    }
    expect(refused).toBeGreaterThan(1000);
    expect(accepted).toBeGreaterThan(200);
  });

  it("makes a bot wait for its turn", () => {
    const { game, core, bots } = setup(basicRules(), 3, 2);
    const other = (game.current + 1) % 3;
    const before = snapshot(game);
    expect(core.stepBot(other, bots[other]!)).toEqual({ ok: false, error: "it is not your turn" });
    expect(snapshot(game)).toBe(before);
  });
});

describe("Core: events are public", () => {
  const ALLOWED: Record<GameEvent["type"], readonly string[]> = {
    rearranged: ["seat", "type", "visible"],
    rolled: ["seat", "set", "type"],
    peered: ["seat", "type"],
    peeked: ["seat", "type"],
    claimed: ["rank", "seat", "type"],
    pulled: ["claim", "claimTrue", "claimer", "dice", "eliminated", "loser", "puller", "revealed", "seat", "type"],
    round: ["opener", "type"],
    won: ["seat", "type"],
  };

  it("carries nothing but public facts: only a pull shows dice, and a peer or peek shows none", () => {
    let seen = 0;
    for (const [rules, players] of SHAPES) {
      for (let seed = 0; seed < 6; seed++) {
        for (const e of playThroughCore(rules, players, seed).events) {
          expect(Object.keys(e).sort()).toEqual([...ALLOWED[e.type]].sort());
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(500);
  });

  it("rolls the hidden set when a roll names no set, which is the only roll basic rules allow", () => {
    for (const rules of [basicRules(), advancedRules()]) {
      const { game, core } = setup(rules, 2, 6);
      const res = core.apply(game.current, { action: "roll" });
      expect(res).toMatchObject({ ok: true, events: [{ type: "rolled", set: "hidden" }] });
    }
  });

  it("reports a roll by the set that was rolled, never by its faces", () => {
    const { game, core } = setup(advancedRules(), 2, 6);
    const res = core.apply(game.current, { action: "roll", set: "visible" });
    expect(res).toMatchObject({ ok: true, events: [{ type: "rolled", set: "visible" }] });
  });
});
