import {
  PROTOCOL_VERSION,
  nextRank,
  type ClientMessage,
  type RoomEvent,
  type SeatKind,
  type ServerMessage,
} from "@liars-dice/engine";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRemoteSession } from "./remoteSession.ts";
import { RemoteTable } from "./remoteTable.ts";
import { NO_HIDDEN_DIE } from "./session.ts";
import { server } from "./test-server.ts";

/**
 * The hook over a `RemoteTable` fed by the engine's own core, with a `send` that writes down what was sent. `line`
 * says whether the connection is up.
 */
function mount(
  opts: { seat?: number; kinds?: SeatKind[]; opener?: number; advanced?: boolean; claimed?: boolean; peered?: boolean } = {},
) {
  const s = server(1, ["Ann", "Bo", "Cy"], opts.kinds, {
    ...(opts.opener === undefined ? {} : { opener: opts.opener }),
    ...(opts.advanced === undefined ? {} : { advanced: opts.advanced }),
  });
  if (opts.claimed) {
    // Ann opens and claims, so it is Bo's turn at the start, where the dice may still be rearranged.
    s.ok(0, { action: "roll" });
    if (!opts.advanced) s.ok(0, { action: "peek" });
    s.ok(0, { action: "claim", rank: nextRank(s.game.claim)! });
  }
  // Bo peers, which is what opens the way to rearranging the dice before a roll.
  if (opts.peered) s.ok(1, { action: "peer" });
  const table = new RemoteTable(s.started(opts.seat ?? 0));
  const sent: ClientMessage[] = [];
  const line = { up: true };
  const send = vi.fn((message: ClientMessage) => {
    if (line.up) sent.push(message);
    return line.up;
  });
  const hook = renderHook(() => useRemoteSession(table, send));
  const now = () => hook.result.current;
  const tell = (message: ServerMessage) => act(() => table.receive(message));
  return { s, table, hook, now, sent, line, tell };
}

const intents = (sent: ClientMessage[]) => sent.map((m) => (m.type === "intent" ? m.intent : m));
const say = (message: object): ServerMessage => ({ v: PROTOCOL_VERSION, ...message }) as ServerMessage;

describe("useRemoteSession: what the table is given", () => {
  it("is a session for a game that is not local, drawn from the table's state", () => {
    const { s, now } = mount({ seat: 1 });
    const session = now();
    expect(session.local).toBe(false);
    expect(session.view).toEqual(s.core.views()[1]);
    expect(session.viewer).toBe(1);
    expect(session.seatKinds).toEqual(["human", "human", "human"]);
    expect(session.isHuman(2)).toBe(true);
    expect(session.humanCount).toBe(3);
    expect(session.handoff).toBeNull();
    expect(session.levelReveal).toBeUndefined();
    expect(session.pace).toBe("slow");
    expect(session.log).toEqual(["Ann opens the game"]);
    expect(session.pulled).toBeNull();
    expect(session.error).toBeNull();
  });

  it("counts who is a bot from the seat kinds the server sent", () => {
    const { now } = mount({ kinds: ["human", "bot", "bot"] });
    expect(now().isHuman(1)).toBe(false);
    expect(now().humanCount).toBe(1);
  });

  it("says a bot is to move when the seat to move is a bot, and not otherwise", () => {
    const bot = mount({ kinds: ["human", "bot", "human"], opener: 1 });
    expect(bot.now().botSeat).toBe(1);
    expect(bot.now().botTurn).toBe(true);
    const human = mount({ kinds: ["human", "bot", "human"], opener: 0 });
    expect(human.now().botSeat).toBeNull();
    expect(human.now().botTurn).toBe(false);
  });

  it("says no bot is to move once the game is won", () => {
    const { now, tell, s } = mount({ kinds: ["human", "bot", "human"], opener: 1 });
    const view = { ...s.core.views()[0]!, winner: 0 };
    tell({ v: PROTOCOL_VERSION, type: "state", view, kinds: ["human", "bot", "human"], events: [] });
    expect(now().botSeat).toBeNull();
  });

  it("shows the oldest reveal not yet dismissed, and the next one after it is dismissed", () => {
    const { now, tell, s } = mount();
    const pull = (n: number): RoomEvent =>
      ({ type: "pulled", seat: 0, puller: 0, claimer: 1, claim: {}, dice: [n], revealed: {}, claimTrue: true, loser: 2, eliminated: false }) as unknown as RoomEvent;
    tell(s.message(0, [pull(1), pull(2)]));
    expect(now().pulled?.dice).toEqual([1]);
    act(() => now().dismissPull());
    expect(now().pulled?.dice).toEqual([2]);
    act(() => now().dismissPull());
    expect(now().pulled).toBeNull();
  });

  it("shows what the server refused, and what it said went wrong on this side", () => {
    const { now, tell } = mount();
    tell(say({ type: "error", code: "illegal", error: "it is not your turn" }));
    expect(now().error).toBe("it is not your turn");
  });

  it("leaves the bot pace, pausing and stepping to the server, and the handoff to nobody", () => {
    const { now, sent } = mount();
    act(() => {
      now().setPace("fast");
      now().setPaused(true);
      now().nextBotStep();
      now().acceptHandoff();
    });
    expect(sent).toEqual([]);
    expect(now().pace).toBe("slow");
  });
});

describe("useRemoteSession: what the player does", () => {
  it("sends each action to the server as an intent", () => {
    const { now, sent } = mount({ seat: 1, claimed: true });
    const rank = nextRank(now().view.claim)!;
    act(() => {
      now().pullCup();
      now().peer();
      now().peek();
      now().claim(rank);
    });
    expect(sent).toEqual([
      { type: "intent", intent: { action: "pull" } },
      { type: "intent", intent: { action: "peer" } },
      { type: "intent", intent: { action: "peek" } },
      { type: "intent", intent: { action: "claim", rank } },
    ]);
  });

  it("takes the compulsory peek straight after a roll under basic rules, as a local game does", () => {
    const { now, sent } = mount({ seat: 1, claimed: true });
    act(() => now().roll("hidden"));
    expect(intents(sent)).toEqual([{ action: "roll", set: "hidden" }, { action: "peek" }]);
  });

  it("leaves the peek to the player under advanced rules", () => {
    const { now, sent } = mount({ seat: 1, claimed: true, advanced: true });
    act(() => now().roll("visible"));
    expect(intents(sent)).toEqual([{ action: "roll", set: "visible" }]);
  });

  it("says so when a move cannot be sent, and sends nothing", () => {
    const { now, line, sent, tell, s } = mount({ seat: 1, claimed: true });
    line.up = false;
    act(() => now().pullCup());
    expect(sent).toEqual([]);
    expect(now().error).toBe("Not connected. Your move was not sent.");
    tell(s.message(1, [])); // the next message from the server clears it, as it does any error
    expect(now().error).toBeNull();
  });
});

describe("useRemoteSession: arranging the trays", () => {
  const dragOne = (now: () => ReturnType<typeof useRemoteSession>) => {
    const hidden = [0, 1, 2, 3, 4].find((i) => !now().visibleSet.has(i))!;
    act(() => now().moveDie(hidden, "visible"));
    return hidden;
  };

  it("moves a die between the trays on this side only, until the player acts", () => {
    const { now, sent } = mount({ seat: 1, claimed: true, peered: true });
    const before = now().visibleSet.size;
    const die = dragOne(now);
    expect(now().visibleSet.has(die)).toBe(true);
    expect(now().visibleSet.size).toBe(before + 1);
    expect(sent).toEqual([]);
    act(() => now().moveDie(die, "hidden"));
    expect(now().visibleSet.has(die)).toBe(false);
  });

  it("sends the arrangement just before the roll that follows it", () => {
    const { now, sent } = mount({ seat: 1, claimed: true, peered: true });
    const die = dragOne(now);
    act(() => now().roll("hidden"));
    expect(sent).toHaveLength(3);
    const [first, second, third] = intents(sent) as [{ action: string; visible: number[] }, unknown, unknown];
    expect(first.action).toBe("rearrange");
    expect(first.visible).toContain(die);
    expect(new Set(first.visible)).toEqual(now().visibleSet);
    expect(second).toEqual({ action: "roll", set: "hidden" });
    expect(third).toEqual({ action: "peek" });
  });

  it("sends it before a peek or a claim as well, and not at all when nothing was moved", () => {
    const peek = mount({ seat: 1, claimed: true, peered: true, advanced: true });
    dragOne(peek.now);
    act(() => peek.now().peek());
    expect(intents(peek.sent).map((i) => (i as { action: string }).action)).toEqual(["rearrange", "peek"]);

    const claim = mount({ seat: 1, claimed: true, peered: true, advanced: true });
    dragOne(claim.now);
    act(() => claim.now().claim(nextRank(claim.now().view.claim)!));
    expect(intents(claim.sent).map((i) => (i as { action: string }).action)).toEqual(["rearrange", "claim"]);

    const plain = mount({ seat: 1, claimed: true, peered: true, advanced: true });
    act(() => plain.now().claim(nextRank(plain.now().view.claim)!));
    expect(intents(plain.sent).map((i) => (i as { action: string }).action)).toEqual(["claim"]);
  });

  it("drops the arrangement once the turn has moved on, so the trays show the server's", () => {
    const { now, tell, s } = mount({ seat: 1, claimed: true, peered: true });
    dragOne(now);
    tell(s.state(s.ok(1, { action: "roll" }), 1));
    expect(now().visibleSet).toEqual(new Set(now().view.visible));
  });

  it("keeps the arrangement through a message that does not move the turn on", () => {
    const { now, tell, s } = mount({ seat: 1, claimed: true, peered: true });
    const die = dragOne(now);
    tell(s.message(1, [{ type: "dropped", seat: 2 }]));
    expect(now().visibleSet.has(die)).toBe(true);
  });

  it("does not carry an arrangement into a later round, even to the same seat and step", () => {
    const { now, tell, s } = mount({ seat: 1, claimed: true, peered: true });
    const die = dragOne(now);
    const view = { ...s.core.views()[1]!, lives: s.core.views()[1]!.lives.map((n, i) => (i === 2 ? n - 1 : n)) };
    tell({ v: PROTOCOL_VERSION, type: "state", view, kinds: s.seatKinds, events: [] });
    expect(now().visibleSet.has(die)).toBe(false);
  });

  it("ignores a drag when it is not the viewer's turn", () => {
    const { now, sent } = mount({ seat: 2, claimed: true, peered: true }); // it is Bo's turn, and Cy is only watching
    act(() => now().moveDie(0, "visible"));
    expect(now().visibleSet).toEqual(new Set(now().view.visible));
    expect(now().error).toBeNull();
    expect(sent).toEqual([]);
  });

  it("ignores a drag at a point where the dice cannot be rearranged", () => {
    const { now } = mount({ seat: 0 }); // the opening roll: rearranging is not on offer
    expect(now().view.available).not.toContain("rearrange");
    act(() => now().moveDie(0, "visible"));
    expect(now().visibleSet.size).toBe(0);
  });

  it("refuses a split that leaves no hidden die to roll under basic rules, and says why", () => {
    const { now } = mount({ seat: 1, claimed: true, peered: true });
    let moved = 0;
    for (let i = 0; i < 5 && now().error === null; i++) {
      const hidden = [0, 1, 2, 3, 4].find((d) => !now().visibleSet.has(d));
      if (hidden === undefined) break;
      act(() => now().moveDie(hidden, "visible"));
      moved++;
    }
    expect(now().error).toBe(NO_HIDDEN_DIE);
    expect(now().visibleSet.size).toBe(4); // the fifth die stayed where it was
    // Moving one back is fine, and clears the message.
    act(() => now().moveDie([...now().visibleSet][0]!, "hidden"));
    expect(now().error).toBeNull();
    expect(moved).toBeGreaterThan(0);
  });

  it("lets every die go in the visible tray under advanced rules", () => {
    const { now } = mount({ seat: 1, claimed: true, peered: true, advanced: true });
    for (const d of [0, 1, 2, 3, 4]) act(() => now().moveDie(d, "visible"));
    expect(now().visibleSet.size).toBe(5);
    expect(now().error).toBeNull();
  });

  it("does not carry an arrangement to a later turn of the same seat that has the same lives and step", () => {
    // Bo's turn comes round again with nothing lost in between, but the standing claim is a different one.
    const { now, tell, s } = mount({ seat: 1, claimed: true, peered: true });
    const die = dragOne(now);
    const base = s.core.views()[1]!;
    tell({ v: PROTOCOL_VERSION, type: "state", view: { ...base, claim: nextRank(base.claim)! }, kinds: s.seatKinds, events: [] });
    expect(now().visibleSet.has(die)).toBe(false);
  });

  it("lets a new action clear a refusal from the server, as a local game does", () => {
    const { now, tell } = mount({ seat: 1, claimed: true });
    tell(say({ type: "error", code: "illegal", error: "it is not your turn" }));
    expect(now().error).toBe("it is not your turn");
    act(() => now().pullCup());
    expect(now().error).toBeNull();
  });

  it("shows the latest of two messages, not the first, when a refusal and a bad drag meet", () => {
    const { now, tell } = mount({ seat: 1, claimed: true, peered: true });
    tell(say({ type: "error", code: "illegal", error: "it is not your turn" }));
    for (const d of [0, 1, 2, 3, 4]) act(() => now().moveDie(d, "visible"));
    expect(now().error).toBe(NO_HIDDEN_DIE);
  });

  it("clears its own notice when the player acts", () => {
    const { now } = mount({ seat: 1, claimed: true, peered: true });
    for (const d of [0, 1, 2, 3, 4]) act(() => now().moveDie(d, "visible"));
    expect(now().error).toBe(NO_HIDDEN_DIE);
    act(() => now().pullCup());
    expect(now().error).toBeNull();
  });
});
