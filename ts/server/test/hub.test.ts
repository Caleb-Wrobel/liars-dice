import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../src/protocol.ts";
import { lobbyOf, newHub, playIfOnTurn, playToEnd } from "./harness.ts";

describe("creating and joining", () => {
  it("gives the creator a place, a secret token and a lobby with themselves as host", () => {
    const { client } = newHub();
    const sam = client();
    sam.send({ type: "create", name: "  Sam ", seats: 4, lives: 5, advanced: true });
    expect(sam.messages).toHaveLength(1);
    const joined = sam.all("joined")[0]!;
    expect(joined.v).toBe(PROTOCOL_VERSION);
    expect(joined.code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(joined.token).toMatch(/^[0-9a-f]{32}$/);
    expect(joined.you).toBe(joined.lobby.host);
    expect(joined.lobby).toMatchObject({
      code: joined.code,
      capacity: 4,
      lives: 5,
      advanced: true,
      bots: 3,
      players: [{ id: joined.you, name: "Sam" }],
    });
  });

  it("tells the others in a lobby when someone joins, and the newcomer gets only their own welcome", () => {
    const { clients, code } = lobbyOf(["Ann", "Bo"], 4);
    const [ann, bo] = clients as [(typeof clients)[0], (typeof clients)[0]];
    expect(bo.messages.map((m) => m.type)).toEqual(["joined"]);
    expect(bo.all("joined")[0]!.code).toBe(code);
    expect(ann.messages.map((m) => m.type)).toEqual(["joined", "lobby"]);
    expect(ann.all("lobby")[0]!.lobby.players.map((p) => p.name)).toEqual(["Ann", "Bo"]);
    expect(ann.all("lobby")[0]!.lobby.bots).toBe(2);
    expect(bo.all("joined")[0]!.you).not.toBe(ann.all("joined")[0]!.you);
  });

  it("hands out a different token to everyone", () => {
    const { clients } = lobbyOf(["Ann", "Bo", "Cy", "Di", "Ed", "Flo"], 6);
    const tokens = clients.map((c) => c.token);
    expect(new Set(tokens).size).toBe(6);
  });

  it("turns away what the registry refuses, saying why, and tells nobody else", () => {
    const { clients, code, client } = lobbyOf(["Ann", "Bo"], 2);
    const [ann] = clients;
    ann!.clear();
    const stranger = client();
    stranger.send({ type: "join", code: "BBBB", name: "X" });
    stranger.send({ type: "join", code: "12", name: "X" });
    stranger.send({ type: "join", code, name: "Zed" }); // the room is full
    stranger.send({ type: "create", name: "", seats: 4 });
    stranger.send({ type: "create", name: "X", seats: 9 });
    stranger.send({ type: "create", name: "X", seats: 3, lives: 9 });
    expect(stranger.all("error").map((e) => e.code)).toEqual(["no_room", "bad_code", "room_full", "bad_name", "bad_seats", "bad_rules"]);
    expect(ann!.messages).toEqual([]);
  });

  it("refuses a second create or join from a connection already in a room", () => {
    const { clients, code } = lobbyOf(["Ann", "Bo"], 4);
    clients[0]!.send({ type: "create", name: "Again", seats: 3 });
    clients[1]!.send({ type: "join", code, name: "Twice" });
    expect(clients[0]!.last).toMatchObject({ type: "error", code: "in_room" });
    expect(clients[1]!.last).toMatchObject({ type: "error", code: "in_room" });
  });
});

describe("bad messages", () => {
  it("are answered with an error and never throw", () => {
    const { client } = newHub();
    const c = client();
    const junk: unknown[] = [null, 5, "start", [], {}, { v: 1 }, { v: 2, type: "start" }, { v: 1, type: "dance" }, { v: 1, type: "join" }];
    for (const raw of junk) c.raw(raw);
    expect(c.all("error")).toHaveLength(junk.length);
    expect(c.all("error").map((e) => e.code)).toEqual(["malformed", "malformed", "malformed", "malformed", "version", "malformed", "version", "malformed", "malformed"]);
  });

  it("from someone not in a room say so", () => {
    const { client } = newHub();
    const c = client();
    c.send({ type: "start" });
    c.send({ type: "leave" });
    c.send({ type: "intent", intent: { action: "pull" } });
    expect(c.all("error").map((e) => e.code)).toEqual(["no_room", "no_room", "no_room"]);
  });

  it("ignore a connection the hub has never heard of, or has forgotten", () => {
    const { hub, client } = newHub();
    hub.receive(999, { v: 1, type: "start" });
    hub.disconnect(999);
    const c = client();
    c.disconnect();
    hub.receive(c.conn, { v: 1, type: "start" });
    expect(c.messages).toEqual([]);
  });
});

describe("leaving a lobby", () => {
  it("passes the host on and closes an empty room", () => {
    const { clients, hub } = lobbyOf(["Ann", "Bo", "Cy"], 4);
    const [ann, bo, cy] = clients as [(typeof clients)[0], (typeof clients)[0], (typeof clients)[0]];
    ann.send({ type: "leave" });
    expect(ann.last).toEqual({ v: PROTOCOL_VERSION, type: "left" });
    expect(bo.all("lobby").at(-1)!.lobby).toMatchObject({ host: bo.all("joined")[0]!.you, bots: 2 });
    expect(cy.all("lobby").at(-1)!.lobby.players.map((p) => p.name)).toEqual(["Bo", "Cy"]);
    bo.send({ type: "leave" });
    cy.send({ type: "leave" });
    expect(hub.roomCount).toBe(0);
  });

  it("lets the same connection make a fresh room afterwards", () => {
    const { clients, hub } = lobbyOf(["Ann"], 3);
    clients[0]!.send({ type: "leave" });
    clients[0]!.send({ type: "create", name: "Ann", seats: 2 });
    expect(clients[0]!.last).toMatchObject({ type: "joined" });
    expect(hub.roomCount).toBe(1);
  });
});

describe("starting a game", () => {
  it("is for the host, sends every human their own view, and closes the lobby", () => {
    const { clients, code, client } = lobbyOf(["Ann", "Bo"], 4);
    const [ann, bo] = clients as [(typeof clients)[0], (typeof clients)[0]];
    bo.send({ type: "start" });
    expect(bo.last).toMatchObject({ type: "error", code: "not_host" });
    ann.send({ type: "start" });
    for (const c of [ann, bo]) {
      const started = c.all("started");
      expect(started).toHaveLength(1);
      expect(started[0]!.view.names).toHaveLength(4);
      expect(started[0]!.events).toEqual([{ type: "round", opener: started[0]!.view.current }]);
    }
    expect(ann.view!.you).not.toBe(bo.view!.you);
    ann.send({ type: "start" });
    expect(ann.last).toMatchObject({ type: "error", code: "started" });
    const late = client();
    late.send({ type: "join", code, name: "Late" });
    expect(late.last).toMatchObject({ type: "error", code: "started" });
  });

  it("starts with the host alone: the bots fill every other seat", () => {
    const { clients } = lobbyOf(["Ann"], 5, { lives: 1 });
    clients[0]!.send({ type: "start" });
    expect(clients[0]!.view!.names).toHaveLength(5);
    expect(clients[0]!.view!.lives).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("playing", () => {
  it("answers an illegal or out-of-turn move to the sender alone", () => {
    const { clients } = lobbyOf(["Ann", "Bo"], 2);
    const [ann, bo] = clients as [(typeof clients)[0], (typeof clients)[0]];
    ann.send({ type: "start" });
    const onTurn = ann.view!.current === ann.view!.you ? ann : bo;
    const other = onTurn === ann ? bo : ann;
    ann.clear();
    bo.clear();
    other.send({ type: "intent", intent: { action: "roll" } });
    expect(other.messages).toHaveLength(1);
    expect(other.last).toMatchObject({ type: "error", code: "illegal", error: "it is not your turn" });
    expect(onTurn.messages).toEqual([]);
    onTurn.send({ type: "intent", intent: { action: "claim", rank: { category: 1, faces: [4], kicker: 0 } } }); // too early
    expect(onTurn.last).toMatchObject({ type: "error", code: "illegal" });
    onTurn.send({ type: "intent", intent: "nonsense" });
    expect(onTurn.last).toMatchObject({ type: "error", code: "illegal", error: "that is not a move" });
    expect(other.messages).toHaveLength(1);
  });

  it("refuses a move before the game has started", () => {
    const { clients } = lobbyOf(["Ann", "Bo"], 3);
    clients[1]!.send({ type: "intent", intent: { action: "roll" } });
    expect(clients[1]!.last).toMatchObject({ type: "error", code: "not_started" });
  });

  it("sends each player only their own view, whoever moves, and never a hidden die that is not theirs", () => {
    const { clients, clock } = lobbyOf(["Ann", "Bo"], 4, { advanced: true });
    clients[0]!.send({ type: "start" });
    playToEnd(clients, clock);
    let checked = 0;
    for (const c of clients) {
      const seat = c.view!.you;
      for (const m of [...c.all("started"), ...c.all("state")]) {
        expect(m.view.you).toBe(seat);
        m.view.dice.forEach((face, i) => {
          if (face !== null) expect(m.view.visible.includes(i) || m.view.current === seat).toBe(true);
          checked++;
        });
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("plays whole games to a winner that every player is told about", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { clients, clock } = lobbyOf(["Ann", "Bo", "Cy"], 5, { lives: 1 }, seed);
      clients[0]!.send({ type: "start" });
      playToEnd(clients, clock);
      const winners = clients.map((c) => c.view!.winner);
      expect(new Set(winners).size).toBe(1);
      expect(winners[0]).not.toBeNull();
      for (const c of clients) {
        const events = [...c.all("started"), ...c.all("state")].flatMap((m) => m.events);
        expect(events.filter((e) => e.type === "won")).toEqual([{ type: "won", seat: winners[0] }]);
      }
    }
  });

  it("keeps going when a player's connection has gone: nothing is sent to it, and the others are still served", () => {
    const { clients, clock } = lobbyOf(["Ann", "Bo"], 3, { lives: 1 });
    clients[0]!.send({ type: "start" });
    const [ann, gone] = clients as [(typeof clients)[0], (typeof clients)[0]];
    gone.disconnect();
    const before = gone.messages.length;
    clock.advance(120_000); // bots play on
    ann.send({ type: "intent", intent: "nonsense" });
    expect(ann.last).toMatchObject({ type: "error", code: "illegal", error: "that is not a move" });
    expect(gone.messages.length).toBe(before);
  });
});

describe("a busy server", () => {
  it("stops making rooms at its cap and says so", () => {
    const t = newHub(1, { maxRooms: 2 });
    const [a, b, c] = [t.client(), t.client(), t.client()] as const;
    a.send({ type: "create", name: "A", seats: 2 });
    b.send({ type: "create", name: "B", seats: 2 });
    c.send({ type: "create", name: "C", seats: 2 });
    expect(c.last).toMatchObject({ type: "error", code: "busy" });
    expect(t.hub.roomCount).toBe(2);
  });
});
