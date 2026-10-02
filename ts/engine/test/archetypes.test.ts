import { describe, expect, it } from "vitest";
import {
  Bot,
  ARCHETYPES,
  ARCHETYPE_IDS,
  Game,
  advancedRules,
  basicRules,
  drawArchetypes,
  seededRng,
  weightsOf,
  type Archetype,
} from "../src/index.ts";

const byId = (id: string): Archetype => ARCHETYPES.find((p) => p.id === id)!;

describe("the archetypes", () => {
  it("has five distinct archetypes", () => {
    expect(ARCHETYPES).toHaveLength(5);
    expect(new Set(ARCHETYPES.map((p) => p.id)).size).toBe(5);
    expect(new Set(ARCHETYPES.map((p) => p.name)).size).toBe(5);
    expect(new Set(ARCHETYPES.map((p) => p.brief)).size).toBe(5);
  });

  it("gives every archetype a name and a one-line brief a persona's bio can be checked against", () => {
    for (const p of ARCHETYPES) {
      expect(p.name.length, p.id).toBeGreaterThan(0);
      expect(p.id, "an id is lower-case and theme-free").toMatch(/^[a-z]+$/);
      expect(p.brief.length, p.id).toBeGreaterThan(20);
      expect(p.brief.length, p.id).toBeLessThanOrEqual(110);
    }
  });

  it("lists the same ids as the type themes are checked against", () => {
    expect(ARCHETYPES.map((p) => p.id)).toEqual([...ARCHETYPE_IDS]);
  });

  it("keeps every habit inside sane limits", () => {
    for (const { id, habits } of ARCHETYPES) {
      const allowed = ["bluff", "sandbag", "rearrange", "gambleRoll", "blindClaim"];
      expect(Object.keys(habits).every((k) => allowed.includes(k)), `${id} uses only known habits`).toBe(true);
      for (const step of habits.bluff ?? []) expect(Number.isInteger(step) && step >= 1 && step <= 8, id).toBe(true);
      for (const step of habits.sandbag ?? []) expect(Number.isInteger(step) && step >= 0 && step <= 6, id).toBe(true);
      for (const chance of [habits.rearrange, habits.gambleRoll, habits.blindClaim]) {
        if (chance !== undefined) expect(chance >= 0 && chance <= 1, id).toBe(true);
      }
    }
  });

  it("lets every archetype finish games under both rule sets", () => {
    for (const archetype of ARCHETYPES) {
      for (const rules of [basicRules(), advancedRules()]) {
        for (let seed = 0; seed < 8; seed++) {
          const game = new Game(["A", "B"], rules, seededRng(seed));
          const bots = [new Bot({ rng: seededRng(seed * 2 + 1), archetype }), new Bot({ rng: seededRng(seed * 2 + 2) })];
          for (let n = 0; n < 3000 && game.winner === null; n++) bots[game.current]!.play(game);
          expect(game.winner, `${archetype.name} seed ${seed}`).not.toBeNull();
        }
      }
    }
  });
});

describe("drawArchetypes", () => {
  it("draws the number asked for, without repeats", () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const drawn = drawArchetypes(count, seededRng(count));
      expect(drawn).toHaveLength(count);
      expect(new Set(drawn.map((p) => p.id)).size).toBe(count);
    }
  });

  it("draws the whole cast, in some order, when all five are wanted", () => {
    expect(drawArchetypes(5, seededRng(1)).map((p) => p.id).sort()).toEqual(ARCHETYPES.map((p) => p.id).sort());
  });

  it("clamps the count to what exists", () => {
    expect(drawArchetypes(0)).toEqual([]);
    expect(drawArchetypes(-3)).toEqual([]);
    expect(drawArchetypes(99)).toHaveLength(5);
  });

  it("repeats for the same seed and varies between seeds", () => {
    const ids = (seed: number) => drawArchetypes(3, seededRng(seed)).map((p) => p.id);
    expect(ids(7)).toEqual(ids(7));
    expect(new Set(Array.from({ length: 20 }, (_, seed) => ids(seed).join())).size).toBeGreaterThan(5);
  });

  it("gives everyone a fair share of the seats", () => {
    const rng = seededRng(21);
    const seats = new Map<string, number>();
    const tables = 5000;
    for (let i = 0; i < tables; i++) for (const p of drawArchetypes(2, rng)) seats.set(p.id, (seats.get(p.id) ?? 0) + 1);
    for (const p of ARCHETYPES) expect((seats.get(p.id) ?? 0) / tables, p.id).toBeGreaterThan(0.36); // 2 of 5 is 40%
  });
});

describe("weightsOf", () => {
  const KEYS = ["bluffing", "withholding", "gambling"] as const;

  it("scores every archetype from 1 to 5", () => {
    for (const p of ARCHETYPES) {
      for (const value of Object.values(weightsOf(p))) {
        expect(Number.isInteger(value) && value >= 1 && value <= 5, p.id).toBe(true);
      }
    }
  });

  it("uses the whole range on each meter, so the archetypes reads as different people", () => {
    for (const key of KEYS) {
      const scores = ARCHETYPES.map((p) => weightsOf(p)[key]);
      expect(Math.min(...scores), key).toBe(1);
      expect(Math.max(...scores), key).toBe(5);
    }
  });

  it("reads the way the bios do", () => {
    const w = (id: string) => weightsOf(byId(id));
    expect(w("bluffer").bluffing).toBe(5);
    expect(w("honest").bluffing).toBeLessThanOrEqual(2);
    expect(w("creeper").bluffing).toBe(1);
    expect(w("honest").withholding).toBe(1);
    expect(w("sandbagger").withholding).toBe(5);
    expect(w("gambler").gambling).toBe(5);
    expect(w("sandbagger").gambling).toBeLessThanOrEqual(2);
  });

  it("rises with the habit that drives it", () => {
    const make = (habits: Archetype["habits"]): Archetype => ({ id: "x", name: "X", brief: "", habits });
    expect(weightsOf(make({ bluff: [8] })).bluffing).toBeGreaterThan(weightsOf(make({ bluff: [1] })).bluffing);
    expect(weightsOf(make({ sandbag: [6] })).withholding).toBeGreaterThan(weightsOf(make({ sandbag: [0] })).withholding);
    expect(weightsOf(make({ blindClaim: 1 })).gambling).toBeGreaterThan(weightsOf(make({})).gambling);
  });

  it("scores an archetype that is alone against itself as middling", () => {
    const only = byId("bluffer");
    expect(weightsOf(only, [only])).toEqual({ bluffing: 3, withholding: 3, gambling: 3 });
  });
});
