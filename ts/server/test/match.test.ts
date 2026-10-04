import { BOT_PACE_MS, DECISION_BEAT, nextRank, seededRng, type SeatView } from "@liars-dice/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Match, botNames, realClock, type MatchUpdate } from "../src/match.ts";
import type { MatchSetup } from "../src/rooms.ts";
import { FakeClock } from "./clock.ts";

const setupOf = (
  names: string[],
  capacity: number,
  rules: { lives?: number; advanced?: boolean } = {},
): MatchSetup => ({
  code: "KTMR",
  capacity,
  lives: rules.lives ?? 3,
  advanced: rules.advanced ?? false,
  players: names.map((name, i) => ({ id: i + 1, name })),
});

function start(setup: MatchSetup, seed = 1) {
  const clock = new FakeClock();
  const updates: MatchUpdate[] = [];
  const match = new Match(setup, { rng: seededRng(seed), clock, onUpdate: (u) => updates.push(u) });
  return { match, clock, updates };
}

/** Plays a human's turn by what the view offers: pull if it can, else roll, peek, then the smallest raise. */
function humanMove(match: Match, player: number) {
  const v = match.view(player)!;
  const [action] = (["pull", "roll", "peek", "claim"] as const).filter((a) => v.available.includes(a));
  const intent = action === "claim" ? { action, rank: nextRank(v.claim)! } : { action };
  return match.submit(player, intent);
}

/** Runs a match to its end: humans move when it is their turn, the clock runs the bots. */
function playOut(match: Match, clock: FakeClock, humans: number[]) {
  for (let i = 0; i < 5000 && match.winner === null; i++) {
    const mover = humans.find((p) => match.view(p)!.available.length > 0);
    if (mover !== undefined) expect(humanMove(match, mover)).toEqual({ ok: true });
    else clock.advance(10_000);
  }
  expect(match.winner).not.toBeNull();
}

describe("botNames", () => {
  it("gives plain names that no human has, ignoring case, then Bot 1, Bot 2", () => {
    expect(botNames(3, [])).toEqual(["Bob", "Carol", "Dave"]);
    expect(botNames(3, ["bob", "EVE"])).toEqual(["Carol", "Dave", "Frank"]);
    expect(botNames(5, ["Bob"])).toEqual(["Carol", "Dave", "Eve", "Frank", "Bot 1"]);
    expect(botNames(1, ["Bob", "Carol", "Dave", "Eve", "Frank"])).toEqual(["Bot 1"]);
    expect(botNames(2, ["Bot 1"])).toEqual(["Bob", "Carol"]);
    expect(botNames(0, [])).toEqual([]);
    const all = botNames(5, ["Bob", "Bot 1"]);
    expect(new Set(all.map((n) => n.toLowerCase())).size).toBe(5);
  });
});

describe("a new match", () => {
  it("seats every human once and fills the rest with bots, names unique whatever the humans are called", () => {
    for (let seed = 0; seed < 25; seed++) {
      const { match } = start(setupOf(["Ann", "bob"], 5), seed);
      expect(match.seats).toHaveLength(5);
      expect(match.seats.filter((s) => s.kind === "human").map((s) => s.name).sort()).toEqual(["Ann", "bob"]);
      const names = match.seats.map((s) => s.name.toLowerCase());
      expect(new Set(names).size).toBe(5);
      expect(match.seats.filter((s) => s.kind === "bot").map((s) => s.name).sort()).toEqual(["Carol", "Dave", "Eve"]);
      for (const player of [1, 2]) expect(match.seats[match.seatOf(player)!]).toMatchObject({ kind: "human" });
    }
  });

  it("shuffles the seats, so the host does not always sit first", () => {
    const orders = new Set<string>();
    const firstSeatIsHost = new Set<boolean>();
    for (let seed = 0; seed < 60; seed++) {
      const { match } = start(setupOf(["Ann", "Bo"], 4), seed);
      orders.add(match.seats.map((s) => s.name).join());
      firstSeatIsHost.add(match.seatOf(1) === 0);
    }
    expect(orders.size).toBeGreaterThan(8);
    expect(firstSeatIsHost).toEqual(new Set([true, false]));
  });

  it("starts with the rules the host chose, and announces the opener to every seat", () => {
    const { match } = start(setupOf(["Ann", "Bo"], 3, { lives: 5, advanced: true }), 4);
    expect(match.initial.views).toHaveLength(3);
    const opener = (match.initial.events[0] as { type: "round"; opener: number }).opener;
    expect(match.initial.events).toEqual([{ type: "round", opener }]);
    expect(opener).toBeGreaterThanOrEqual(0);
    expect(opener).toBeLessThan(3);
    match.initial.views.forEach((v, seat) => {
      expect(v.you).toBe(seat);
      expect(v.lives).toEqual([5, 5, 5]);
      expect(v.rules.rollOptional).toBe(true);
      expect(v.current).toBe(opener);
    });
    const basic = start(setupOf(["Ann", "Bo"], 3), 4).match.initial.views[0]!;
    expect(basic.rules.rollOptional).toBe(false);
    expect(basic.lives).toEqual([3, 3, 3]);
  });

  it("shows each human their own view, and nothing to anyone who is not playing", () => {
    const { match } = start(setupOf(["Ann", "Bo"], 3), 6);
    for (const player of [1, 2]) {
      const v = match.view(player) as SeatView;
      expect(v).toEqual(match.initial.views[match.seatOf(player)!]);
      expect(v.you).toBe(match.seatOf(player));
    }
    expect(match.view(99)).toBeUndefined();
    expect(match.seatOf(99)).toBeUndefined();
  });
});

describe("bots on the clock", () => {
  /** A match whose opener is a bot, so something is scheduled from the start. */
  const botOpens = () => {
    for (let seed = 0; seed < 100; seed++) {
      const t = start(setupOf(["Ann"], 3), seed);
      const opener = (t.match.initial.events[0] as { opener: number }).opener;
      if (t.match.seats[opener]!.kind === "bot") return t;
    }
    throw new Error("no seed had a bot open");
  };

  it("wait a human-sized pause, then move, and stop when it is the human's turn", () => {
    const { match, clock, updates } = botOpens();
    expect(clock.pending).toBe(1);
    expect(updates).toHaveLength(0);
    clock.advance(BOT_PACE_MS.normal - 1); // the opener begins at the roll, which is not a decision
    expect(updates).toHaveLength(0);
    clock.advance(1);
    expect(updates.length).toBeGreaterThan(0);
    clock.advance(60_000);
    expect(match.view(1)!.available.length).toBeGreaterThan(0); // it is Ann's turn
    expect(clock.pending).toBe(0); // nothing is waiting: a human is
  });

  it("wait one and a half times as long before a decision as before a plain move", () => {
    for (let seed = 0; seed < 100; seed++) {
      const { match, clock, updates } = start(setupOf(["Ann"], 2, { advanced: true }), seed);
      const opener = (match.initial.events[0] as { opener: number }).opener;
      if (match.seats[opener]!.kind === "human") {
        // Ann opens: she rolls, peeks and claims, and then the bot faces a decision.
        for (const action of ["roll", "peek"]) expect(match.submit(1, { action })).toEqual({ ok: true });
        expect(match.submit(1, { action: "claim", rank: nextRank(match.view(1)!.claim)! })).toEqual({ ok: true });
        const count = updates.length;
        clock.advance(BOT_PACE_MS.normal * DECISION_BEAT - 1);
        expect(updates.length).toBe(count);
        clock.advance(1);
        expect(updates.length).toBeGreaterThan(count);
        return;
      }
    }
    throw new Error("no seed had the human open");
  });
});

describe("players' moves", () => {
  it("are refused for someone not in the game, out of turn, or not shaped like a move, and change nothing", () => {
    const { match, updates } = start(setupOf(["Ann", "Bo"], 4), 3);
    const turn = match.view(1)!.current;
    const human = [1, 2].find((p) => match.seatOf(p) !== turn);
    expect(match.submit(99, { action: "pull" })).toEqual({ ok: false, error: "you are not in this game" });
    if (human !== undefined) expect(match.submit(human, { action: "roll" })).toEqual({ ok: false, error: "it is not your turn" });
    const mover = [1, 2].find((p) => match.seatOf(p) === turn);
    if (mover !== undefined) {
      expect(match.submit(mover, { action: "hack" })).toEqual({ ok: false, error: "that is not a move" });
      expect(match.submit(mover, null)).toEqual({ ok: false, error: "that is not a move" });
    }
    expect(updates).toHaveLength(0);
  });

  it("tell everyone, each seat getting its own view", () => {
    for (let seed = 0; seed < 100; seed++) {
      const { match, updates } = start(setupOf(["Ann", "Bo"], 2, { advanced: true }), seed);
      const opener = (match.initial.events[0] as { opener: number }).opener;
      const player = [1, 2].find((p) => match.seatOf(p) === opener)!;
      expect(match.submit(player, { action: "roll" })).toEqual({ ok: true });
      expect(updates).toHaveLength(1);
      expect(updates[0]!.events).toMatchObject([{ type: "rolled", seat: opener, set: "hidden" }]);
      updates[0]!.views.forEach((v, seat) => expect(v.you).toBe(seat));
      return;
    }
  });
});

describe("a whole match", () => {
  it("plays through to a winner with bots on the clock and humans moving by the view", () => {
    for (let seed = 0; seed < 12; seed++) {
      const { match, clock, updates } = start(setupOf(["Ann", "Bo"], 4, { lives: 1 }), seed);
      playOut(match, clock, [1, 2]);
      const events = updates.flatMap((u) => u.events);
      expect(events.at(-1)).toEqual({ type: "won", seat: match.winner });
      expect(events.filter((e) => e.type === "won")).toHaveLength(1);
      expect(clock.pending).toBe(0);
    }
  });

  it("replays identically for the same seed", () => {
    const run = () => {
      const { match, clock, updates } = start(setupOf(["Ann", "Bo"], 4, { lives: 2 }), 9);
      playOut(match, clock, [1, 2]);
      return JSON.stringify({ seats: match.seats, initial: match.initial, updates });
    };
    expect(run()).toBe(run());
  });

  it("stops the bots when it is stopped", () => {
    const t = (() => {
      for (let seed = 0; seed < 100; seed++) {
        const x = start(setupOf(["Ann"], 3), seed);
        if (x.clock.pending === 1) return x;
      }
      throw new Error("no seed had a bot open");
    })();
    t.match.stop();
    expect(t.clock.pending).toBe(0);
    t.clock.advance(120_000);
    expect(t.updates).toHaveLength(0);
  });
});

describe("the real clock", () => {
  afterEach(() => vi.useRealTimers());

  it("runs a timer after its delay, and not once it is cleared", () => {
    vi.useFakeTimers();
    const ran: string[] = [];
    realClock.setTimeout(() => ran.push("a"), 100);
    const b = realClock.setTimeout(() => ran.push("b"), 100);
    realClock.clearTimeout(b);
    vi.advanceTimersByTime(99);
    expect(ran).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(ran).toEqual(["a"]);
  });
});
