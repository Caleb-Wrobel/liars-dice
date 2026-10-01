import { Step, parseRank } from "@liars-dice/engine";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BOT_DELAY_MS, HUMAN, useSession, type Config } from "./session.ts";

const basic: Config = { name: "Alice", lives: 3, advanced: false, seed: 1 };
const advanced: Config = { ...basic, advanced: true };

afterEach(() => vi.useRealTimers());

/** Alice opens with the smallest claim and Bob answers, leaving Alice to act. */
function afterBobAnswers(config: Config) {
  vi.useFakeTimers();
  const hook = renderHook(() => useSession(config));
  const { result } = hook;
  if (!config.advanced) {
    act(() => result.current.roll("hidden"));
    act(() => result.current.peek());
  }
  act(() => result.current.claim(parseRank("none 1")));
  act(() => {
    vi.advanceTimersByTime(BOT_DELAY_MS + 50);
  });
  return hook;
}

describe("useSession", () => {
  it("opens at the roll step, and basic rules lock claiming until roll and peek", () => {
    const { result } = renderHook(() => useSession(basic));
    const { game } = result.current;
    expect(game.current).toBe(HUMAN);
    expect(game.step).toBe(Step.Roll);
    expect(game.available()).not.toContain("claim");
    act(() => result.current.roll("hidden"));
    expect(game.available()).not.toContain("claim");
    act(() => result.current.peek());
    expect(game.available()).toContain("claim");
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

  it("hands over to Bob, who answers after a short delay", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSession(advanced));
    act(() => result.current.claim(parseRank("none 1")));
    expect(result.current.game.current).toBe(1);
    expect(result.current.botTurn).toBe(true);
    act(() => {
      vi.advanceTimersByTime(BOT_DELAY_MS + 50);
    });
    expect(result.current.log.some((line) => line.startsWith("Bob "))).toBe(true);
    expect(result.current.game.current).toBe(HUMAN);
    expect(result.current.game.step).toBe(Step.Decide);
  });

  it("seats several bots, who answer one after another", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSession({ ...advanced, opponents: 3 }));
    expect(result.current.game.names).toEqual(["Alice", "Bob", "Carol", "Dave"]);
    act(() => result.current.claim(parseRank("none 1")));
    expect(result.current.botSeat).toBe(1);
    act(() => {
      vi.advanceTimersByTime(BOT_DELAY_MS + 50);
    });
    // Bob has moved; unless he pulled, it's now Carol's turn and she answers next.
    if (result.current.pulled === null) {
      expect(result.current.botSeat).toBe(2);
      act(() => {
        vi.advanceTimersByTime(BOT_DELAY_MS + 50);
      });
    }
    const spoke = (who: string) => result.current.log.some((line) => line.startsWith(`${who} `));
    expect(spoke("Bob")).toBe(true);
    expect(result.current.pulled !== null || spoke("Carol")).toBe(true);
  });

  it("keeps the opponent count within the available bots", () => {
    const { result } = renderHook(() => useSession({ ...advanced, opponents: 99 }));
    expect(result.current.game.names).toHaveLength(6);
    const { result: low } = renderHook(() => useSession({ ...advanced, opponents: 0 }));
    expect(low.current.game.names).toHaveLength(2);
  });

  it("drafts a rearrangement and commits it when the player rolls", () => {
    const { result } = afterBobAnswers(basic);
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
    const { result } = afterBobAnswers(basic);
    act(() => result.current.peer());
    for (const die of [0, 1, 2, 3, 4]) act(() => result.current.moveDie(die, "visible"));
    expect(result.current.visibleSet.size).toBe(4);
    expect(result.current.error).toMatch(/hidden die/);
  });

  it("lets advanced players put every die in the visible tray", () => {
    const { result } = afterBobAnswers(advanced);
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
    const { result } = afterBobAnswers(basic);
    const before = result.current.game.lives.reduce((a, b) => a + b, 0);
    act(() => result.current.pullCup());
    expect(result.current.pulled).not.toBeNull();
    expect(result.current.game.lives.reduce((a, b) => a + b, 0)).toBe(before - 1);
    act(() => result.current.dismissPull());
    expect(result.current.pulled).toBeNull();
  });
});
