import { Core, Game, advancedRules, basicRules, seededRng, view, type SeatView } from "@liars-dice/engine";
import { describe, expect, it } from "vitest";
import { agreementProblems, leaked, livesProblems, viewProblems } from "../playtest/checks.ts";
import { playtest } from "../playtest/run.ts";
import { chooseIntent } from "../playtest/strategy.ts";
import { liveServer } from "./sockets.ts";

/** A real view of a fresh three-seat game, as seat `seat` would be sent it. */
function freshView(seat: number): SeatView {
  return view(new Game(["A", "B", "C"], basicRules(3), seededRng(5), "random"), seat);
}

describe("viewProblems", () => {
  it("finds nothing wrong with a view the engine made, for every seat", () => {
    for (const seat of [0, 1, 2]) expect(viewProblems(freshView(seat), seat)).toEqual([]);
  });

  it("notices a view that reached the wrong seat", () => {
    expect(viewProblems(freshView(1), 2)).toEqual(["a view for seat 1 reached seat 2"]);
  });

  it("notices a hidden die shown to a seat that is not on turn", () => {
    const game = new Game(["A", "B", "C"], basicRules(3), seededRng(5), "random");
    const other = (game.current + 1) % 3;
    const leaky = { ...view(game, other), dice: game.dice.slice() };
    const problems = viewProblems(leaky, other);
    expect(problems).toHaveLength(5);
    expect(problems[0]).toMatch(/die 0 is hidden but shows \d to a seat that is not on turn/);
  });

  it("allows the dice that are visible, and every die to the seat on turn", () => {
    const game = new Game(["A", "B", "C"], basicRules(3), seededRng(5), "random");
    expect(viewProblems({ ...view(game, game.current), dice: game.dice.slice() }, game.current)).toEqual([]);
  });

  it("notices a field the view should not have", () => {
    const extra = { ...freshView(0), seed: 1 } as SeatView;
    expect(viewProblems(extra, 0)[0]).toMatch(/wrong fields/);
  });

  it("notices moves open to a seat that cannot move, and a winner nobody can account for", () => {
    const base = freshView(0);
    const waiting = (base.current + 1) % 3;
    expect(viewProblems({ ...freshView(waiting), available: ["claim"] }, waiting)).toEqual(["moves are open to a seat that cannot move"]);
    expect(viewProblems({ ...base, winner: 2 }, 0)).toEqual(expect.arrayContaining([expect.stringMatching(/the winner is 2/)]));
  });
});

describe("the other checks", () => {
  it("lives may only fall", () => {
    const before = { ...freshView(0), lives: [3, 3, 3] };
    expect(livesProblems(before, { ...before, lives: [3, 2, 3] })).toEqual([]);
    expect(livesProblems(before, { ...before, lives: [3, 3, 4] })).toEqual(["seat 2 went from 3 lives to 4"]);
    expect(livesProblems(undefined, before)).toEqual([]);
  });

  it("seats must end with the same table", () => {
    const a = freshView(0);
    expect(agreementProblems([a, { ...a, you: 1 }])).toEqual([]);
    expect(agreementProblems([a, { ...a, you: 1, lives: [3, 3, 1] }])).toEqual(["seat 1 and seat 0 ended with different tables"]);
    expect(agreementProblems([])).toEqual([]);
  });

  it("finds a secret that appears in a message, and ignores one nobody has yet", () => {
    const secrets = new Map([["Ann", "tok-ann"], ["Bo", ""]]);
    expect(leaked('{"token":"tok-ann"}', secrets)).toEqual(["Ann"]);
    expect(leaked('{"token":"other"}', secrets)).toEqual([]);
  });
});

describe("chooseIntent", () => {
  it("has no move for a seat that has none", () => {
    expect(chooseIntent(freshView((freshView(0).current + 1) % 3), seededRng(1))).toBeNull();
  });

  it("plays whole games through the engine without ever making a move it refuses, under either rules", () => {
    for (const rules of [basicRules, advancedRules]) {
      for (let seed = 1; seed <= 25; seed++) {
        const rng = seededRng(seed);
        const core = new Core(new Game(["A", "B", "C"], rules(2), rng, "random"));
        let turns = 0;
        while (core.game.winner === null) {
          if (++turns > 5000) throw new Error(`seed ${seed} did not finish`);
          const seat = core.game.current;
          const intent = chooseIntent(core.views()[seat]!, rng);
          const res = core.apply(seat, intent);
          if (!res.ok) throw new Error(`seed ${seed}: ${JSON.stringify(intent)} was refused: ${res.error}`);
        }
      }
    }
  });
});

describe("playtest against a live server", () => {
  it("plays rooms through drops, second connections and resumes with nothing wrong", async () => {
    const live = await liveServer(11);
    try {
      const results = await playtest({
        url: live.url, rooms: 4, concurrency: 4, seed: 7, minHumans: 2, maxHumans: 3, maxBots: 0,
        drop: 0.25, ghost: 0.5, leave: 0, thinkMs: 10, stallMs: 15_000, log: () => {},
      });
      expect(results.flatMap((r) => r.problems)).toEqual([]);
      expect(results.reduce((n, r) => n + r.drops, 0)).toBeGreaterThan(0);
    } finally {
      await live.stop();
    }
  }, 60_000);
});
