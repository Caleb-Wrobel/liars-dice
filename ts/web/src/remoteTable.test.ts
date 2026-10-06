import {
  PROTOCOL_VERSION,
  basicRules,
  formatRank,
  nextRank,
  type PullResult,
  type RoomEvent,
  type ServerMessage,
} from "@liars-dice/engine";
import { describe, expect, it, vi } from "vitest";
import { LOG_LINES, RemoteTable, eventLines } from "./remoteTable.ts";
import { server } from "./test-server.ts";

const say = (message: object): ServerMessage => ({ v: PROTOCOL_VERSION, ...message }) as ServerMessage;

describe("RemoteTable: following a game", () => {
  it("holds exactly the view the server sent, for every seat, through whole games", () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = server(seed, ["Ann", "Bo", "Cy"], ["bot", "bot", "bot"]);
      const tables = [0, 1, 2].map((seat) => new RemoteTable(s.started(seat)));
      let pulled = 0;
      for (let i = 0; i < 5000 && s.game.winner === null; i++) {
        const seat = s.game.current;
        const res = s.core.stepBot(seat, s.bots[seat]!);
        if (!res.ok) throw new Error(res.error);
        pulled += res.events.filter((e) => e.type === "pulled").length;
        tables.forEach((table, who) => table.receive(s.state(res, who)));
        tables.forEach((table, who) => expect(table.getState().view).toEqual(res.views[who]));
      }
      expect(s.game.winner).not.toBeNull();
      for (const table of tables) {
        const state = table.getState();
        expect(state.view.winner).toBe(s.game.winner);
        expect(state.pulls).toHaveLength(pulled); // none was dismissed, so every reveal is still waiting
        expect(state.log.length).toBeLessThanOrEqual(LOG_LINES);
        expect(state.log.at(-1)).toBe(`${s.game.names[s.game.winner!]} wins the game`);
      }
    }
  });

  it("keeps nothing but what the server sent", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    expect(Object.keys(table.getState()).sort()).toEqual(["error", "kinds", "log", "pulls", "view"]);
  });

  it("does not show another seat's hidden dice, because the view it holds does not", () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = server(seed);
      const table = new RemoteTable(s.started(1)); // Bo, watching Ann open
      s.ok(0, { action: "roll" });
      s.ok(0, { action: "peek" });
      const res = s.ok(0, { action: "claim", rank: nextRank(s.game.claim)! });
      table.receive(s.state(res, 1));
      const view = table.getState().view;
      const hidden = [...Array(view.dice.length).keys()].filter((i) => !view.visible.includes(i));
      expect(hidden.length).toBeGreaterThan(0);
      for (const i of hidden) expect(view.dice[i]).toBeNull();
    }
  });

  it("starts the table talk with who opens the game", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    expect(table.getState().log).toEqual(["Ann opens the game"]);
    expect(table.getState().error).toBeNull();
    expect(table.getState().pulls).toEqual([]);
    expect(table.getState().kinds).toEqual(["human", "human", "human"]);
  });

  it("turns a turn's events into lines, with each move by name", () => {
    const s = server();
    const table = new RemoteTable(s.started(1));
    const roll = s.ok(0, { action: "roll" });
    table.receive(s.state(roll, 1));
    const peek = s.ok(0, { action: "peek" });
    table.receive(s.state(peek, 1));
    const rank = nextRank(s.game.claim)!;
    const claim = s.ok(0, { action: "claim", rank });
    table.receive(s.state(claim, 1));
    expect(table.getState().log).toEqual([
      "Ann opens the game",
      "Ann rolls the cup",
      `Ann claims ${formatRank(rank)}`, // the peek says nothing: what it showed is private
    ]);
  });

  it("says who lost a life when a cup is pulled, and queues the reveal", () => {
    const s = server();
    const table = new RemoteTable(s.started(1));
    s.ok(0, { action: "roll" });
    s.ok(0, { action: "peek" });
    table.receive(s.state(s.ok(0, { action: "claim", rank: nextRank(s.game.claim)! }), 1));
    const pull = s.ok(1, { action: "pull" });
    table.receive(s.state(pull, 1));
    const result = pull.events.find((e) => e.type === "pulled") as PullResult;
    const state = table.getState();
    expect(state.log.slice(-3)).toEqual([
      "Bo pulls the cup",
      `${s.game.names[result.loser]} loses a life`,
      `${s.game.names[s.game.current]} opens the round`,
    ]);
    expect(state.pulls).toHaveLength(1);
    expect(state.pulls[0]).toEqual({
      puller: result.puller,
      claimer: result.claimer,
      claim: result.claim,
      dice: result.dice,
      revealed: result.revealed,
      claimTrue: result.claimTrue,
      loser: result.loser,
      eliminated: result.eliminated,
    });
  });
});

describe("RemoteTable: reveals", () => {
  const pull = (n: number): RoomEvent => ({
    type: "pulled",
    seat: 0,
    puller: 0,
    claimer: 1,
    claim: { category: 0, faces: [], kicker: 0 } as never,
    dice: [n, n, n, n, n],
    revealed: { category: 0, faces: [], kicker: 0 } as never,
    claimTrue: false,
    loser: 1,
    eliminated: false,
  });
  const arrive = (table: RemoteTable, s: ReturnType<typeof server>, events: RoomEvent[]) =>
    table.receive(s.message(0, events));

  it("queue in the order they arrived, and each is dismissed in turn", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    arrive(table, s, [pull(1)]);
    arrive(table, s, [pull(2), pull(3)]);
    expect(table.getState().pulls.map((p) => p.dice[0])).toEqual([1, 2, 3]);
    table.dismissPull();
    expect(table.getState().pulls.map((p) => p.dice[0])).toEqual([2, 3]);
    table.dismissPull();
    table.dismissPull();
    expect(table.getState().pulls).toEqual([]);
  });

  it("keep every field of a reveal, told apart by giving each seat a different part", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    const event = {
      type: "pulled",
      seat: 0,
      puller: 0,
      claimer: 1,
      claim: { category: 1, faces: [4], kicker: 0 },
      dice: [1, 2, 3, 4, 5],
      revealed: { category: 2, faces: [3], kicker: 0 },
      claimTrue: true,
      loser: 2,
      eliminated: true,
    } as unknown as RoomEvent;
    arrive(table, s, [event]);
    expect(table.getState().pulls).toEqual([
      {
        puller: 0,
        claimer: 1,
        claim: { category: 1, faces: [4], kicker: 0 },
        dice: [1, 2, 3, 4, 5],
        revealed: { category: 2, faces: [3], kicker: 0 },
        claimTrue: true,
        loser: 2,
        eliminated: true,
      },
    ]);
  });

  it("dismissing with nothing waiting changes nothing and tells no one", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    const listener = vi.fn();
    table.subscribe(listener);
    const before = table.getState();
    table.dismissPull();
    expect(table.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("RemoteTable: the table talk", () => {
  it("keeps only the latest lines", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    for (let i = 0; i < LOG_LINES + 5; i++) {
      table.receive(s.message(0, [{ type: "peered", seat: i % 3 }]));
    }
    const log = table.getState().log;
    expect(log).toHaveLength(LOG_LINES);
    expect(log.at(-1)).toBe("Ann peers at the hidden dice".replace("Ann", ["Ann", "Bo", "Cy"][(LOG_LINES + 4) % 3]!));
    expect(log).not.toContain("Ann opens the game"); // the first line has scrolled off
  });

  it("describes absence, in words that assume nothing about anyone", () => {
    const view = { names: ["Sam", "Alex"], rules: basicRules(3) };
    const lines = (["dropped", "back", "botTook"] as const).flatMap((type) => eventLines({ type, seat: 1 }, view, false));
    expect(lines).toEqual(["Alex lost the connection", "Alex is back", "Alex is now played by a bot"]);
    for (const line of lines) expect(line).not.toMatch(/\b(he|she|his|her|him)\b/i);
  });

  it("says the loser of a pull, who need not be the one who pulled", () => {
    const view = { names: ["Sam", "Alex", "Kit"], rules: basicRules(3) };
    const event = { type: "pulled", seat: 0, puller: 0, claimer: 1, loser: 2, eliminated: false } as unknown as RoomEvent;
    expect(eventLines(event, view, false)).toEqual(["Sam pulls the cup", "Kit loses a life"]);
  });

  it("says a player is out when the pull eliminates them", () => {
    const view = { names: ["Sam", "Alex"], rules: basicRules(3) };
    const event = { type: "pulled", seat: 0, puller: 0, loser: 1, eliminated: true } as unknown as RoomEvent;
    expect(eventLines(event, view, false)).toEqual(["Sam pulls the cup", "Alex is out of the game"]);
  });

  it("opens a round, not the game, once the game is under way", () => {
    const view = { names: ["Sam", "Alex"], rules: basicRules(3) };
    expect(eventLines({ type: "round", opener: 1 }, view, true)).toEqual(["Alex opens the game"]);
    expect(eventLines({ type: "round", opener: 1 }, view, false)).toEqual(["Alex opens the round"]);
  });

  it("names a rolled set when the rules let the player choose one", () => {
    const view = { names: ["Sam"], rules: { rollable: ["visible", "hidden"] } } as never;
    expect(eventLines({ type: "rolled", seat: 0, set: "hidden" }, view, false)).toEqual(["Sam rolls the hidden set"]);
  });

  it("says something about every kind of event it can be sent that is not private", () => {
    const view = { names: ["Sam", "Alex"], rules: basicRules(3) };
    const events: RoomEvent[] = [
      { type: "rearranged", seat: 0, visible: [0] },
      { type: "peered", seat: 0 },
      { type: "won", seat: 1 },
    ];
    expect(events.map((e) => eventLines(e, view, false))).toEqual([
      ["Sam rearranges the sets"],
      ["Sam peers at the hidden dice"],
      ["Alex wins the game"],
    ]);
    expect(eventLines({ type: "peeked", seat: 0 }, view, false)).toEqual([]);
  });

  it("falls back to a neutral word for a seat it has no name for", () => {
    expect(eventLines({ type: "peered", seat: 9 }, { names: ["Sam"], rules: basicRules(3) }, false)).toEqual([
      "A player peers at the hidden dice",
    ]);
  });
});

describe("RemoteTable: other messages", () => {
  it("shows a bot taking a seat in who holds each seat", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    table.receive(s.message(0, [{ type: "botTook", seat: 1 }], ["human", "bot", "human"]));
    expect(table.getState().kinds).toEqual(["human", "bot", "human"]);
    expect(table.getState().log.at(-1)).toBe("Bo is now played by a bot");
  });

  it("takes the view and who holds each seat from a resume, and leaves the talk as it was", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    const res = s.ok(0, { action: "roll" });
    const before = table.getState().log;
    table.receive(
      say({ type: "joined", code: "KTMR", token: "t", you: 1, lobby: {}, view: res.views[0], kinds: ["human", "bot", "human"] }),
    );
    expect(table.getState().view).toEqual(res.views[0]);
    expect(table.getState().kinds).toEqual(["human", "bot", "human"]);
    expect(table.getState().log).toBe(before);
  });

  it("ignores a joined that carries no game, as in a lobby", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    const before = table.getState();
    table.receive(say({ type: "joined", code: "KTMR", token: "t", you: 1, lobby: {} }));
    expect(table.getState()).toBe(before);
  });

  it.each([["lobby", { lobby: {} }], ["left", {}], ["replaced", {}]])("ignores %s, which the connection deals with", (type, rest) => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    const before = table.getState();
    const listener = vi.fn();
    table.subscribe(listener);
    table.receive(say({ type, ...rest }));
    expect(table.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("takes a later started message as it takes a state: a new view, kinds and talk", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    const next = server(7, ["Dee", "Eve"]);
    table.receive(next.started(1));
    expect(table.getState().view).toEqual(next.core.views()[1]);
    expect(table.getState().kinds).toEqual(["human", "human"]);
    expect(table.getState().log.at(-1)).toBe(`${next.game.names[next.game.current]} opens the game`);
  });

  it("holds the server's refusal until the next message, which clears it", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    table.receive(say({ type: "error", code: "illegal", error: "you must roll first" }));
    expect(table.getState().error).toBe("you must roll first");
    table.receive(s.state(s.ok(0, { action: "roll" }), 0));
    expect(table.getState().error).toBeNull();
  });

  it("holds a failure on this side too, such as a move that could not be sent", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    table.fail("Not connected");
    expect(table.getState().error).toBe("Not connected");
  });

  it("lets the player move on from an error, and says nothing when there is none", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    const listener = vi.fn();
    table.subscribe(listener);
    table.clearError();
    expect(listener).not.toHaveBeenCalled();
    table.fail("Not connected");
    table.clearError();
    expect(table.getState().error).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("clears an error when a resume brings the game back", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    table.fail("Not connected");
    table.receive(
      say({ type: "joined", code: "KTMR", token: "t", you: 0, lobby: {}, view: s.core.views()[0], kinds: s.seatKinds }),
    );
    expect(table.getState().error).toBeNull();
  });
});

describe("RemoteTable: watching it change", () => {
  it("tells each listener once per change, with a new state each time", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    const a = vi.fn();
    const b = vi.fn();
    table.subscribe(a);
    table.subscribe(b);
    const before = table.getState();
    table.receive(s.state(s.ok(0, { action: "roll" }), 0));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(table.getState()).not.toBe(before);
    expect(table.getState()).toBe(table.getState());
  });

  it("stops telling a listener that has unsubscribed", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    const listener = vi.fn();
    const stop = table.subscribe(listener);
    stop();
    table.fail("x");
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not tell a listener that was added while the others were being told, until the next change", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    const late = vi.fn();
    let added = false;
    table.subscribe(() => {
      if (!added) {
        added = true;
        table.subscribe(late);
      }
    });
    table.fail("x");
    expect(late).not.toHaveBeenCalled();
    table.fail("y");
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("lets a listener unsubscribe while it is being told", () => {
    const s = server();
    const table = new RemoteTable(s.started(0));
    const second = vi.fn();
    const stop = table.subscribe(() => stop());
    table.subscribe(second);
    table.fail("x");
    table.fail("y");
    expect(second).toHaveBeenCalledTimes(2);
  });
});
