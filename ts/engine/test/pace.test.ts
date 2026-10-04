import { describe, expect, it } from "vitest";
import { BOT_NAMES, BOT_PACE_MS, DECISION_BEAT, MAX_SEATS, MIN_SEATS, Step, botDelayMs } from "../src/index.ts";

describe("bot pace", () => {
  it("keeps the numbers tuned by watching real games: normal 1.6 s, slow 3.2 s, fast 0.25 s", () => {
    expect(BOT_PACE_MS).toEqual({ fast: 250, normal: 1600, slow: 3200 });
    expect(DECISION_BEAT).toBe(1.5);
  });

  it("waits the plain pause before a move that is not a decision", () => {
    for (const pace of ["fast", "normal", "slow"] as const) {
      for (const step of [Step.Rearrange, Step.Roll, Step.Peek]) expect(botDelayMs(pace, step)).toBe(BOT_PACE_MS[pace]);
    }
  });

  it("gives a decision, pulling or peering at the start of a turn and claiming at the end, an extra beat", () => {
    for (const pace of ["fast", "normal", "slow"] as const) {
      expect(botDelayMs(pace, Step.Decide)).toBe(BOT_PACE_MS[pace] * DECISION_BEAT);
      expect(botDelayMs(pace, Step.Claim)).toBe(BOT_PACE_MS[pace] * DECISION_BEAT);
    }
  });
});

describe("the shape of a table", () => {
  it("seats 2 to 6, and has enough plain bot names for every seat but the first", () => {
    expect(MIN_SEATS).toBe(2);
    expect(MAX_SEATS).toBe(6);
    expect(BOT_NAMES).toHaveLength(MAX_SEATS - 1);
    expect(new Set(BOT_NAMES.map((n) => n.toLowerCase())).size).toBe(BOT_NAMES.length);
  });
});
