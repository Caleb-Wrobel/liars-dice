import { describe, expect, it } from "vitest";
import { GRACE_MS } from "../src/hub.ts";
import { lobbyOf, playToEnd, type TestClient } from "./harness.ts";

const SECOND = 1000;

/** A started game with Ann hosting, Bo joined and bots in the other seats. */
function game(seed = 1, seats = 4, rules: Record<string, unknown> = {}) {
  const t = lobbyOf(["Ann", "Bo"], seats, rules, seed);
  const [ann, bo] = t.clients as [TestClient, TestClient];
  ann.send({ type: "start" });
  ann.clear();
  bo.clear();
  return { ...t, ann, bo };
}

/** The seat a client holds, and the events it was told, flattened. */
const eventsOf = (c: TestClient) => [...c.all("started"), ...c.all("state")].flatMap((m) => m.events);

describe("coming back to a lobby", () => {
  it("keeps your place if you return within the window, and nobody else is told anything", () => {
    const { clients, client, clock } = lobbyOf(["Ann", "Bo"], 4);
    const [ann, bo] = clients as [TestClient, TestClient];
    const token = bo.token;
    bo.disconnect();
    ann.clear();
    clock.advance(GRACE_MS - SECOND);
    const again = client();
    again.send({ type: "resume", token });
    expect(again.messages).toHaveLength(1);
    expect(again.last).toMatchObject({ type: "joined", code: bo.all("joined")[0]!.code, token, you: bo.all("joined")[0]!.you });
    expect(again.all("joined")[0]!.view).toBeUndefined();
    expect(again.all("joined")[0]!.lobby.players.map((p) => p.name)).toEqual(["Ann", "Bo"]);
    clock.advance(10 * GRACE_MS);
    expect(ann.messages).toEqual([]);
    expect(clock.pending).toBe(0);
  });

  it("frees the seat when the window ends, and the token stops working", () => {
    const { clients, client, clock } = lobbyOf(["Ann", "Bo", "Cy"], 4);
    const [ann, bo, cy] = clients as [TestClient, TestClient, TestClient];
    const token = bo.token;
    bo.disconnect();
    const seen = ann.all("lobby").length;
    clock.advance(GRACE_MS - 1);
    expect(ann.all("lobby")).toHaveLength(seen); // still held
    clock.advance(1);
    expect(ann.all("lobby").at(-1)!.lobby.players.map((p) => p.name)).toEqual(["Ann", "Cy"]);
    expect(cy.all("lobby").at(-1)!.lobby.bots).toBe(2);
    const late = client();
    late.send({ type: "resume", token });
    expect(late.last).toMatchObject({ type: "error", code: "unknown_token" });
  });

  it("hands the host on, in join order, when the host's window ends", () => {
    const { clients, clock } = lobbyOf(["Ann", "Bo", "Cy"], 4);
    const [ann, bo, cy] = clients as [TestClient, TestClient, TestClient];
    ann.disconnect();
    clock.advance(GRACE_MS);
    expect(bo.all("lobby").at(-1)!.lobby.host).toBe(bo.all("joined")[0]!.you);
    expect(cy.all("lobby").at(-1)!.lobby.host).toBe(bo.all("joined")[0]!.you);
    cy.send({ type: "start" });
    expect(cy.last).toMatchObject({ type: "error", code: "not_host" });
    bo.send({ type: "start" });
    expect(bo.view).toBeDefined();
  });

  it("closes the room when the last person's window ends", () => {
    const { clients, hub, clock } = lobbyOf(["Ann", "Bo"], 3);
    clients[0]!.disconnect();
    clients[1]!.disconnect();
    expect(hub.roomCount).toBe(1);
    clock.advance(GRACE_MS);
    expect(hub.roomCount).toBe(0);
    expect(clock.pending).toBe(0);
  });
});

describe("resuming", () => {
  it("refuses a token nobody holds, and a connection that is already in a room", () => {
    const { clients, client } = lobbyOf(["Ann", "Bo"], 3);
    const stranger = client();
    stranger.send({ type: "resume", token: "0".repeat(32) });
    expect(stranger.last).toMatchObject({ type: "error", code: "unknown_token" });
    clients[0]!.send({ type: "resume", token: clients[1]!.token });
    expect(clients[0]!.last).toMatchObject({ type: "error", code: "in_room" });
    expect(clients[1]!.messages.some((m) => m.type === "replaced")).toBe(false);
  });

  it("lets the newest connection win: the older is told it was replaced and no longer speaks for the place", () => {
    const { clients, client, clock } = lobbyOf(["Ann", "Bo"], 3);
    const [ann, oldBo] = clients as [TestClient, TestClient];
    const newBo = client();
    newBo.send({ type: "resume", token: oldBo.token });
    expect(oldBo.last).toEqual({ v: 1, type: "replaced" });
    expect(newBo.last).toMatchObject({ type: "joined", you: oldBo.all("joined")[0]!.you });
    oldBo.send({ type: "leave" });
    expect(oldBo.last).toMatchObject({ type: "error", code: "no_room" });
    // The old socket closing afterwards is no drop: the place has a live connection.
    oldBo.disconnect();
    expect(clock.pending).toBe(0);
    ann.clear();
    clock.advance(10 * GRACE_MS);
    expect(ann.messages).toEqual([]);
    newBo.send({ type: "leave" });
    expect(newBo.last).toEqual({ v: 1, type: "left" });
  });
});

describe("a drop in a game", () => {
  it("tells the others, and only the others, and then holds the seat", () => {
    const { ann, bo, clock } = game();
    const seat = bo.view!.you;
    bo.disconnect();
    expect(ann.last).toMatchObject({ type: "state", events: [{ type: "dropped", seat }] });
    expect(ann.all("state")[0]!.view.you).toBe(ann.view!.you);
    expect(bo.messages).toEqual([]);
    clock.advance(GRACE_MS - 1);
    expect(eventsOf(ann).some((e) => e.type === "botTook")).toBe(false);
  });

  it("puts a returning player back exactly as they were, with what they had already seen, and tells the table", () => {
    let checked = false;
    for (let seed = 1; seed <= 40 && !checked; seed++) {
      const { ann, bo, client, clock } = game(seed, 3);
      if (bo.view!.current !== bo.view!.you || !bo.view!.available.includes("roll")) continue;
      checked = true;
      bo.send({ type: "intent", intent: { action: "roll" } });
      const before = bo.view!;
      expect(before).not.toEqual(ann.view); // the roll is Bo's own business
      const token = bo.token;
      bo.disconnect();
      ann.clear();
      clock.advance(GRACE_MS - SECOND);
      const again = client();
      again.send({ type: "resume", token });
      expect(again.all("joined")[0]!.view).toEqual(before);
      expect(again.messages).toHaveLength(1); // the welcome says it all; they are not told they are back
      expect(eventsOf(ann).filter((e) => e.type === "back")).toEqual([{ type: "back", seat: before.you }]);
      clock.advance(10 * GRACE_MS);
      expect(eventsOf(ann).some((e) => e.type === "botTook")).toBe(false);
    }
    expect(checked).toBe(true);
  });

  it("gives the seat to a fresh bot when the window ends, and the game carries on from where it was", () => {
    const { ann, bo, client, clock } = game(2, 3, { lives: 1 });
    const seat = bo.view!.you;
    const token = bo.token;
    bo.disconnect();
    clock.advance(GRACE_MS);
    expect(eventsOf(ann).filter((e) => e.type === "botTook")).toEqual([{ type: "botTook", seat }]);
    // The seat is the bot's for good: the token no longer opens it.
    const late = client();
    late.send({ type: "resume", token });
    expect(late.last).toMatchObject({ type: "error", code: "unknown_token" });
    // With one human left, the game runs to its end on its own clock plus Ann's moves.
    playToEnd([ann], clock);
    expect(ann.view!.winner).not.toBeNull();
  });

  it("waits for a dropped player on their turn, then a bot plays it", () => {
    let found = false;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const { ann, bo, clock } = game(seed, 3);
      if (bo.view!.current !== bo.view!.you) continue;
      found = true;
      bo.disconnect();
      ann.clear();
      clock.advance(GRACE_MS - 1);
      expect(eventsOf(ann).filter((e) => e.type !== "dropped")).toEqual([]);
      expect(ann.view!.current).toBe(bo.view!.you);
      clock.advance(1);
      expect(eventsOf(ann).some((e) => e.type === "botTook")).toBe(true);
      clock.advance(30 * SECOND);
      expect(ann.view!.current === bo.view!.you && ann.view!.step === bo.view!.step).toBe(false); // it moved on
    }
    expect(found).toBe(true);
  });

  it("does not hold a place in a finished game: a drop after the end frees it at once", () => {
    const { ann, bo, hub, clock } = game(3, 3, { lives: 1 });
    playToEnd([ann, bo], clock);
    bo.disconnect();
    expect(hub.roomCount).toBe(1);
    ann.disconnect();
    expect(hub.roomCount).toBe(0);
    expect(clock.pending).toBe(0);
  });
});

describe("leaving a game", () => {
  it("gives the seat to a bot at once, tells the leaver and the table, and closes the leaver's access", () => {
    const { ann, bo, hub, clock } = game(4, 3);
    const seat = bo.view!.you;
    bo.send({ type: "leave" });
    expect(bo.last).toEqual({ v: 1, type: "left" });
    expect(eventsOf(ann).filter((e) => e.type === "botTook")).toEqual([{ type: "botTook", seat }]);
    bo.send({ type: "intent", intent: { action: "roll" } });
    expect(bo.last).toMatchObject({ type: "error", code: "no_room" });
    expect(hub.roomCount).toBe(1);
    expect(clock.pending).toBeLessThanOrEqual(1); // no grace timer for a leaver, only the bots' own
    bo.disconnect();
    clock.advance(10 * GRACE_MS);
    expect(eventsOf(ann).filter((e) => e.type === "botTook")).toHaveLength(1);
  });

  it("closes the room and stops its bots when the last person leaves", () => {
    const { ann, bo, hub, clock } = game(6, 4);
    bo.send({ type: "leave" });
    ann.send({ type: "leave" });
    expect(hub.roomCount).toBe(0);
    expect(clock.pending).toBe(0);
    clock.advance(10 * GRACE_MS);
    expect(ann.messages.filter((m) => m.type === "state")).toHaveLength(1);
  });

  it("closes the room when the last person's window ends in a game", () => {
    const { ann, bo, hub, clock } = game(7, 3);
    ann.disconnect();
    bo.disconnect();
    clock.advance(GRACE_MS);
    expect(hub.roomCount).toBe(0);
    expect(clock.pending).toBe(0);
  });
});

describe("whole games with people coming and going", () => {
  it("finish with every player seeing only their own seat, across many seeds", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const t = lobbyOf(["Ann", "Bo", "Cy"], 5, { lives: 1 }, seed);
      const [ann, bo, cy] = t.clients as [TestClient, TestClient, TestClient];
      ann.send({ type: "start" });
      const seats = [ann, bo, cy].map((c) => c.view!.you);
      const token = bo.token;
      for (let i = 0; i < seed * 3; i++) t.clock.advance(3 * SECOND);
      bo.disconnect();
      t.clock.advance(seed % 2 === 0 ? 10 * SECOND : GRACE_MS + SECOND); // some come back, some are replaced
      const back = t.client();
      back.send({ type: "resume", token });
      const humans = seed % 2 === 0 ? [ann, back, cy] : [ann, cy];
      cy.send({ type: "leave" });
      playToEnd(humans.filter((c) => c !== cy), t.clock);
      expect(ann.view!.winner).not.toBeNull();
      for (const [c, seat] of [[ann, seats[0]], [cy, seats[2]]] as const) {
        for (const m of [...c.all("started"), ...c.all("state")]) expect(m.view.you).toBe(seat);
      }
      if (seed % 2 === 0) {
        expect(back.all("joined")[0]!.view!.you).toBe(seats[1]);
        for (const m of back.all("state")) expect(m.view.you).toBe(seats[1]);
      } else {
        expect(back.last).toMatchObject({ type: "error", code: "unknown_token" });
      }
    }
  });
});
