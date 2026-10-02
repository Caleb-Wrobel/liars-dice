import { describe, expect, it } from "vitest";
import { PLAYER_NAMES, pickOne, pickPlayerName } from "./playerNames.ts";
import { BOT_NAMES } from "./session.ts";
import { THEMES } from "./theme.ts";

describe("the player name pools", () => {
  it("has a pool for every table style, and none is empty", () => {
    expect(Object.keys(PLAYER_NAMES).sort()).toEqual(THEMES.map((t) => t.id).sort());
    for (const { id } of THEMES) expect(PLAYER_NAMES[id].length, id).toBeGreaterThanOrEqual(1);
  });

  it("holds clean names that fit the name field and do not repeat", () => {
    for (const { id } of THEMES) {
      const pool = PLAYER_NAMES[id];
      expect(new Set(pool).size, id).toBe(pool.length);
      for (const name of pool) {
        expect(name, `${id}: ${name}`).toBe(name.trim());
        expect(name.length, `${id}: ${name}`).toBeGreaterThan(0);
        expect(name.length, `${id}: ${name}`).toBeLessThanOrEqual(16); // the input's maxLength
        expect(BOT_NAMES as readonly string[], `${id}: ${name} would clash with a plain bot`).not.toContain(name);
      }
    }
  });

  it("never offers Alice, the old default, which is clearly gendered", () => {
    for (const { id } of THEMES) expect(PLAYER_NAMES[id]).not.toContain("Alice");
  });
});

describe("pickOne", () => {
  it("reaches both ends of the pool and stays inside it", () => {
    const pool = ["a", "b", "c"] as const;
    expect(pickOne(pool, () => 0)).toBe("a");
    expect(pickOne(pool, () => 0.5)).toBe("b");
    expect(pickOne(pool, () => 0.999999)).toBe("c");
    expect(pickOne(pool, () => 1)).toBe("c"); // an rng that returns exactly 1 must not run off the end
  });

  it("still works, through the same choice, when the pool holds one name", () => {
    for (const roll of [0, 0.3, 0.999]) expect(pickOne(["Ashleigh"], () => roll)).toBe("Ashleigh");
  });
});

describe("pickPlayerName", () => {
  it("picks from the named style's pool", () => {
    for (const { id } of THEMES) {
      for (let i = 0; i < 20; i++) expect(PLAYER_NAMES[id]).toContain(pickPlayerName(id, () => i / 20));
    }
  });

  it("varies from game to game", () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => pickPlayerName("saloon", () => i / 40)));
    expect(seen.size).toBeGreaterThan(3);
  });
});
