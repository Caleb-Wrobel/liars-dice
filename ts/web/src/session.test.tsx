import { Step, parseRank } from "@liars-dice/engine";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PERSONAS } from "./personas/index.ts";
import { HUMAN, PACE_MS, useSession, type Config } from "./session.ts";

// Alice opens, so these tests can start from her turn. The opener is random otherwise.
const basic: Config = { name: "Alice", lives: 3, advanced: false, seed: 1, opener: 0 };
const advanced: Config = { ...basic, advanced: true };

afterEach(() => vi.useRealTimers());

type Hook = ReturnType<typeof renderHook<ReturnType<typeof useSession>, unknown>>;

/** Lets the bots take their moves, one pause at a time, until it is Alice's turn or a pull happens. */
function letBotsPlay({ result }: Hook, ms: number = PACE_MS.normal) {
  for (let i = 0; i < 40 && result.current.botSeat !== null; i++) {
    act(() => {
      vi.advanceTimersByTime(ms + 10);
    });
  }
}

/** Alice opens with the smallest claim and the bots answer, leaving Alice to act. */
function afterBotsAnswer(config: Config) {
  vi.useFakeTimers();
  const hook = renderHook(() => useSession(config));
  const { result } = hook;
  if (!config.advanced) act(() => result.current.roll("hidden")); // basic rules: the roll takes the peek
  act(() => result.current.claim(parseRank("none 1")));
  letBotsPlay(hook);
  return hook;
}

describe("who opens", () => {
  const unpinned: Config = { name: "Alice", lives: 3, advanced: false, opponents: 3 };
  const openers = (config: Config) =>
    Array.from({ length: 40 }, (_, seed) => renderHook(() => useSession({ ...config, seed })).result.current.game.current);

  it("is a random seat unless one is pinned, and the same seat again for the same seed", () => {
    const seats = openers(unpinned);
    expect(new Set(seats)).toEqual(new Set([0, 1, 2, 3]));
    expect(openers(unpinned)).toEqual(seats);
  });

  it("can be pinned to a seat", () => {
    expect(new Set(openers({ ...unpinned, opener: 2 }))).toEqual(new Set([2]));
  });

  it("is announced in the table talk, by name", () => {
    const { result } = renderHook(() => useSession({ ...unpinned, seed: 3 }));
    const { game, log } = result.current;
    expect(log).toEqual([`${game.names[game.current]} opens the game`]);
  });

  it("lets a bot open: it moves by itself and the player waits their turn", () => {
    vi.useFakeTimers();
    const hook = renderHook(() => useSession({ ...unpinned, opener: 1, seed: 1 }));
    expect(hook.result.current.botSeat).toBe(1);
    letBotsPlay(hook);
    expect(hook.result.current.game.current).toBe(HUMAN);
    expect(hook.result.current.log[0]).toBe("Bob opens the game");
    expect(hook.result.current.log.length).toBeGreaterThan(1);
  });
});

describe("useSession", () => {
  it("opens at the roll step, and basic rules lock claiming until you roll", () => {
    const { result } = renderHook(() => useSession(basic));
    const { game } = result.current;
    expect(game.current).toBe(HUMAN);
    expect(game.step).toBe(Step.Roll);
    expect(game.available()).not.toContain("claim");
    act(() => result.current.roll("hidden"));
    expect(game.available()).toContain("claim");
  });

  it("logs the roll as the cup in basic play and as the set in advanced play", () => {
    const basicHook = renderHook(() => useSession(basic)).result;
    act(() => basicHook.current.roll("hidden"));
    expect(basicHook.current.log).toContain("Alice rolls the cup");
    const advancedHook = renderHook(() => useSession(advanced)).result;
    act(() => advancedHook.current.roll("hidden"));
    expect(advancedHook.current.log).toContain("Alice rolls the hidden set");
  });

  it("takes the compulsory peek for you when you roll under basic rules", () => {
    const { result } = renderHook(() => useSession(basic));
    const { game } = result.current;
    act(() => result.current.roll("hidden"));
    expect(game.peeked).toBe(true);
    expect(game.known.size).toBe(5); // you have seen every die
  });

  it("leaves the peek to you under advanced rules, where it is optional", () => {
    const { result } = renderHook(() => useSession(advanced));
    const { game } = result.current;
    act(() => result.current.roll("hidden"));
    expect(game.peeked).toBe(false);
    expect(game.available()).toContain("peek");
    act(() => result.current.peek());
    expect(game.peeked).toBe(true);
  });

  it("lets advanced rules claim blind, without rolling or peeking", () => {
    const { result } = renderHook(() => useSession(advanced));
    expect(result.current.game.available()).toContain("claim");
  });

  it("reports a rule error instead of throwing", () => {
    const { result } = renderHook(() => useSession(basic));
    act(() => result.current.claim(parseRank("pair 1")));
    expect(result.current.error).toMatch(/roll and peek/);
  });

  it("hands over to Bob, who moves one visible step at a time", () => {
    vi.useFakeTimers();
    const hook = renderHook(() => useSession(advanced));
    const { result } = hook;
    act(() => result.current.claim(parseRank("none 1")));
    expect(result.current.game.current).toBe(1);
    expect(result.current.botTurn).toBe(true);

    act(() => {
      vi.advanceTimersByTime(PACE_MS.normal + 10);
    });
    expect(result.current.log.filter((line) => line.startsWith("Bob "))).toHaveLength(1);
    expect(result.current.game.current).toBe(1); // still mid-turn: one move, not the whole turn

    letBotsPlay(hook);
    expect(result.current.game.current).toBe(HUMAN);
    expect(result.current.game.step).toBe(Step.Decide);
    expect(result.current.log.filter((line) => line.startsWith("Bob ")).length).toBeGreaterThan(1);
  });

  it("seats several bots, who answer one after another", () => {
    vi.useFakeTimers();
    const hook = renderHook(() => useSession({ ...advanced, opponents: 3 }));
    const { result } = hook;
    expect(result.current.game.names).toEqual(["Alice", "Bob", "Carol", "Dave"]);
    act(() => result.current.claim(parseRank("none 1")));
    expect(result.current.botSeat).toBe(1);
    letBotsPlay(hook);
    // Bob has moved; unless somebody pulled, Carol answered him.
    const spoke = (who: string) => result.current.log.some((line) => line.startsWith(`${who} `));
    expect(spoke("Bob")).toBe(true);
    expect(result.current.pulled !== null || spoke("Carol")).toBe(true);
  });

  describe("bot levels", () => {
    const levelsFor = (config: Config) => renderHook(() => useSession(config)).result.current.botLevels;

    it("gives every bot the chosen level", () => {
      expect(levelsFor({ ...advanced, opponents: 4, level: "stabby" })).toEqual(["stabby", "stabby", "stabby", "stabby"]);
    });

    it("defaults to normal", () => {
      expect(levelsFor({ ...advanced, opponents: 2 })).toEqual(["normal", "normal"]);
    });

    it("draws a level for each bot when the choice is random", () => {
      const levels = levelsFor({ ...advanced, opponents: 5, level: "random" });
      expect(levels).toHaveLength(5);
      for (const level of levels) expect(["easy", "normal", "stabby"]).toContain(level);
    });

    it("can seat different levels at one table, and repeats for the same seed", () => {
      const tables = Array.from({ length: 12 }, (_, seed) => levelsFor({ ...advanced, opponents: 5, level: "random", seed }));
      expect(tables.some((levels) => new Set(levels).size > 1)).toBe(true); // a mixed table
      expect(new Set(tables.flat())).toEqual(new Set(["easy", "normal", "stabby"])); // every level turns up
      expect(levelsFor({ ...advanced, opponents: 5, level: "random", seed: 4 })).toEqual(tables[4]);
    });
  });

  it("keeps the opponent count within the available bots", () => {
    const { result } = renderHook(() => useSession({ ...advanced, opponents: 99 }));
    expect(result.current.game.names).toHaveLength(6);
    const { result: low } = renderHook(() => useSession({ ...advanced, opponents: 0 }));
    expect(low.current.game.names).toHaveLength(2);
  });

  it("holds the bots still while paused, then lets them carry on", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSession(advanced));
    act(() => result.current.claim(parseRank("none 1")));
    act(() => result.current.setPaused(true));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.log.some((line) => line.startsWith("Bob "))).toBe(false);

    act(() => result.current.setPaused(false));
    act(() => {
      vi.advanceTimersByTime(PACE_MS.normal + 10);
    });
    expect(result.current.log.some((line) => line.startsWith("Bob "))).toBe(true);
  });

  describe("pacing", () => {
    it("waits longer between bot moves when the pace is slow", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useSession({ ...advanced, pace: "slow" }));
      act(() => result.current.claim(parseRank("none 1")));
      act(() => {
        vi.advanceTimersByTime(PACE_MS.normal + 10);
      });
      expect(result.current.log.some((line) => line.startsWith("Bob "))).toBe(false);
      act(() => {
        vi.advanceTimersByTime(PACE_MS.slow - PACE_MS.normal);
      });
      expect(result.current.log.some((line) => line.startsWith("Bob "))).toBe(true);
    });

    it("can be changed during the game", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useSession({ ...advanced, pace: "slow" }));
      act(() => result.current.claim(parseRank("none 1")));
      act(() => result.current.setPace("fast"));
      act(() => {
        vi.advanceTimersByTime(PACE_MS.fast + 10);
      });
      expect(result.current.log.some((line) => line.startsWith("Bob "))).toBe(true);
    });

    it("waits for Next move in step-by-step mode", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useSession({ ...advanced, pace: "step" }));
      act(() => result.current.claim(parseRank("none 1")));
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(result.current.log.some((line) => line.startsWith("Bob "))).toBe(false);

      act(() => result.current.nextBotStep());
      expect(result.current.log.filter((line) => line.startsWith("Bob "))).toHaveLength(1);
      act(() => result.current.nextBotStep());
      expect(result.current.log.filter((line) => line.startsWith("Bob "))).toHaveLength(2);
    });
  });

  it("drafts a rearrangement and commits it when the player rolls", () => {
    const { result } = afterBotsAnswer(basic);
    act(() => result.current.peer());
    const before = [...result.current.game.visible]; // whatever Bob left showing
    for (const die of [0, 1, 2, 3]) act(() => result.current.moveDie(die, "visible"));
    expect([...result.current.visibleSet]).toEqual(expect.arrayContaining([0, 1, 2, 3]));
    expect([...result.current.game.visible]).toEqual(before); // not committed yet

    act(() => result.current.roll("hidden"));
    expect([...result.current.game.visible]).toEqual(expect.arrayContaining([0, 1, 2, 3]));
    expect(result.current.error).toBeNull();
  });

  it("stops basic players leaving nothing to roll", () => {
    const { result } = afterBotsAnswer(basic);
    act(() => result.current.peer());
    for (const die of [0, 1, 2, 3, 4]) act(() => result.current.moveDie(die, "visible"));
    expect(result.current.visibleSet.size).toBe(4);
    expect(result.current.error).toMatch(/hidden die/);
  });

  it("lets advanced players put every die in the visible tray", () => {
    const { result } = afterBotsAnswer(advanced);
    act(() => result.current.peer());
    for (const die of [0, 1, 2, 3, 4]) act(() => result.current.moveDie(die, "visible"));
    expect(result.current.visibleSet.size).toBe(5);
    expect(result.current.error).toBeNull();
  });

  it("ignores moves when rearranging isn't open", () => {
    const { result } = renderHook(() => useSession(basic)); // opener starts at roll
    act(() => result.current.moveDie(0, "visible"));
    expect(result.current.visibleSet.size).toBe(0);
  });

  it("shows the result of a pull, then clears it", () => {
    const { result } = afterBotsAnswer(basic);
    const before = result.current.game.lives.reduce((a, b) => a + b, 0);
    act(() => result.current.pullCup());
    expect(result.current.pulled).not.toBeNull();
    expect(result.current.game.lives.reduce((a, b) => a + b, 0)).toBe(before - 1);
    act(() => result.current.dismissPull());
    expect(result.current.pulled).toBeNull();
  });
});

describe("characters", () => {
  const seated = (config: Config) => renderHook(() => useSession(config)).result.current.game.names.slice(1);
  const nameSet = (theme: "saloon" | "casino") => new Set(Object.values(PERSONAS[theme]).map((p) => p.name));

  it("names the bots from the table's cast instead of Bob and Carol", () => {
    for (const theme of ["saloon", "casino"] as const) {
      for (const opponents of [1, 3, 5]) {
        const names = seated({ ...basic, opponents, personas: true, theme });
        expect(names, `${theme} ${opponents}`).toHaveLength(opponents);
        expect(new Set(names).size).toBe(opponents);
        for (const name of names) expect(nameSet(theme).has(name), name).toBe(true);
      }
    }
  });

  it("seats the whole cast at a full table, and the same cast again for the same seed", () => {
    const full = seated({ ...basic, opponents: 5, personas: true, theme: "saloon" });
    expect([...full].sort()).toEqual([...nameSet("saloon")].sort());
    const again = (seed: number) => seated({ ...basic, seed, opponents: 3, personas: true, theme: "casino" });
    expect(again(7)).toEqual(again(7));
    expect(new Set(Array.from({ length: 12 }, (_, seed) => again(seed).join())).size).toBeGreaterThan(3);
  });

  it("uses the default theme when none is given", () => {
    const [name] = seated({ ...basic, personas: true });
    expect(nameSet("saloon").has(name!)).toBe(true);
  });

  it("is off unless asked for, and then keeps today's plain bots exactly", () => {
    expect(seated({ ...basic, opponents: 3 })).toEqual(["Bob", "Carol", "Dave"]);
    expect(seated({ ...basic, opponents: 3, personas: false, theme: "casino" })).toEqual(["Bob", "Carol", "Dave"]);
  });

  it("lets a table of characters play at the level the player chose", () => {
    vi.useFakeTimers();
    const hook = renderHook(() => useSession({ ...advanced, opponents: 2, personas: true, theme: "saloon", level: "stabby" }));
    expect(hook.result.current.botLevels).toEqual(["stabby", "stabby"]);
    act(() => hook.result.current.claim(parseRank("none 1")));
    letBotsPlay(hook);
    const bot = hook.result.current.game.names[1]!;
    expect(hook.result.current.log.some((line) => line.startsWith(`${bot} `))).toBe(true);
  });
});
