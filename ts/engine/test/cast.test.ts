import { describe, expect, it } from "vitest";
import {
  Bot,
  CAST,
  Game,
  advancedRules,
  basicRules,
  drawCast,
  seededRng,
  weightsOf,
  type Personality,
} from "../src/index.ts";

const byId = (id: string): Personality => CAST.find((p) => p.id === id)!;

describe("the cast", () => {
  it("has five distinct characters", () => {
    expect(CAST).toHaveLength(5);
    expect(new Set(CAST.map((p) => p.id)).size).toBe(5);
    expect(new Set(CAST.map((p) => p.name)).size).toBe(5);
    expect(new Set(CAST.map((p) => p.archetype)).size).toBe(5);
  });

  it("gives every character a name, an archetype and a bio short enough for a phone card", () => {
    for (const p of CAST) {
      expect(p.name.length, p.id).toBeGreaterThan(0);
      expect(p.archetype.startsWith("The "), p.id).toBe(true);
      expect(p.bio.length, p.id).toBeGreaterThan(20);
      expect(p.bio.length, p.id).toBeLessThanOrEqual(110);
    }
  });

  it("keeps every habit inside sane limits", () => {
    for (const { id, habits } of CAST) {
      const allowed = ["bluff", "sandbag", "rearrange", "gambleRoll", "blindClaim"];
      expect(Object.keys(habits).every((k) => allowed.includes(k)), `${id} uses only known habits`).toBe(true);
      for (const step of habits.bluff ?? []) expect(Number.isInteger(step) && step >= 1 && step <= 12, id).toBe(true);
      for (const step of habits.sandbag ?? []) expect(Number.isInteger(step) && step >= 0 && step <= 6, id).toBe(true);
      for (const chance of [habits.rearrange, habits.gambleRoll, habits.blindClaim]) {
        if (chance !== undefined) expect(chance >= 0 && chance <= 1, id).toBe(true);
      }
    }
  });

  it("lets every character finish games under both rule sets", () => {
    for (const personality of CAST) {
      for (const rules of [basicRules(), advancedRules()]) {
        for (let seed = 0; seed < 8; seed++) {
          const game = new Game(["A", "B"], rules, seededRng(seed));
          const bots = [new Bot({ rng: seededRng(seed * 2 + 1), personality }), new Bot({ rng: seededRng(seed * 2 + 2) })];
          for (let n = 0; n < 3000 && game.winner === null; n++) bots[game.current]!.play(game);
          expect(game.winner, `${personality.name} seed ${seed}`).not.toBeNull();
        }
      }
    }
  });
});

describe("drawCast", () => {
  it("draws the number asked for, without repeats", () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const drawn = drawCast(count, seededRng(count));
      expect(drawn).toHaveLength(count);
      expect(new Set(drawn.map((p) => p.id)).size).toBe(count);
    }
  });

  it("draws the whole cast, in some order, when all five are wanted", () => {
    expect(drawCast(5, seededRng(1)).map((p) => p.id).sort()).toEqual(CAST.map((p) => p.id).sort());
  });

  it("clamps the count to what exists", () => {
    expect(drawCast(0)).toEqual([]);
    expect(drawCast(-3)).toEqual([]);
    expect(drawCast(99)).toHaveLength(5);
  });

  it("repeats for the same seed and varies between seeds", () => {
    const ids = (seed: number) => drawCast(3, seededRng(seed)).map((p) => p.id);
    expect(ids(7)).toEqual(ids(7));
    expect(new Set(Array.from({ length: 20 }, (_, seed) => ids(seed).join())).size).toBeGreaterThan(5);
  });

  it("gives everyone a fair share of the seats", () => {
    const rng = seededRng(21);
    const seats = new Map<string, number>();
    const tables = 5000;
    for (let i = 0; i < tables; i++) for (const p of drawCast(2, rng)) seats.set(p.id, (seats.get(p.id) ?? 0) + 1);
    for (const p of CAST) expect((seats.get(p.id) ?? 0) / tables, p.id).toBeGreaterThan(0.36); // 2 of 5 is 40%
  });
});

describe("weightsOf", () => {
  it("scores every character from 1 to 5", () => {
    for (const p of CAST) {
      for (const value of Object.values(weightsOf(p))) {
        expect(Number.isInteger(value) && value >= 1 && value <= 5, p.id).toBe(true);
      }
    }
  });

  it("reads the way the bios do", () => {
    const w = (id: string) => weightsOf(byId(id));
    const best = (key: "bluffing" | "candor" | "recklessness") => Math.max(...CAST.map((p) => weightsOf(p)[key]));
    const worst = (key: "bluffing" | "candor" | "recklessness") => Math.min(...CAST.map((p) => weightsOf(p)[key]));
    expect(w("calico-kate").bluffing).toBe(best("bluffing"));
    expect(w("straight-up-sam").bluffing).toBe(worst("bluffing"));
    expect(w("straight-up-sam").candor).toBe(best("candor"));
    expect(w("quiet-mabel").candor).toBe(worst("candor"));
    expect(w("lucky-lou").recklessness).toBe(best("recklessness"));
    expect(w("calico-kate").bluffing).toBeGreaterThan(w("lucky-lou").bluffing);
  });

  it("rises with the habit that drives it", () => {
    const make = (habits: Personality["habits"]): Personality => ({ id: "x", name: "X", archetype: "The X", bio: "", habits });
    expect(weightsOf(make({ bluff: [12] })).bluffing).toBeGreaterThan(weightsOf(make({ bluff: [1] })).bluffing);
    expect(weightsOf(make({ sandbag: [0] })).candor).toBeGreaterThan(weightsOf(make({ sandbag: [6] })).candor);
    expect(weightsOf(make({ gambleRoll: 1, blindClaim: 1 })).recklessness).toBeGreaterThan(weightsOf(make({})).recklessness);
  });
});
