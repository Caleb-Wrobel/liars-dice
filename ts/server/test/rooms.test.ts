import { seededRng } from "@liars-dice/engine";
import { describe, expect, it } from "vitest";
import { CODE_ALPHABET } from "../src/codes.ts";
import { RoomRegistry, type Entered, type LobbyView, type RoomFailure } from "../src/rooms.ts";

const fresh = (seed = 1, maxRooms?: number) =>
  new RoomRegistry({ rng: seededRng(seed), ...(maxRooms === undefined ? {} : { maxRooms }) });
const ok = (r: Entered | RoomFailure): Entered => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("creating a room", () => {
  it("makes a lobby with the creator in it as host, and the rest of the seats for bots", () => {
    const rooms = fresh();
    const made = ok(rooms.create("Sam", 4));
    expect(made.code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(made.lobby).toEqual({
      code: made.code,
      capacity: 4,
      host: made.player,
      players: [{ id: made.player, name: "Sam" }],
      bots: 3,
    });
    expect(rooms.size).toBe(1);
    expect(rooms.lobby(made.code)).toEqual(made.lobby);
  });

  it("turns away a bad name or a table that does not seat 2 to 6, and makes nothing", () => {
    const rooms = fresh();
    expect(rooms.create("", 4)).toMatchObject({ ok: false, code: "bad_name" });
    expect(rooms.create("‮evil", 4)).toMatchObject({ ok: false, code: "bad_name" });
    for (const seats of [1, 0, 7, -2, 2.5, NaN, Infinity, "4", null, undefined]) {
      expect(rooms.create("Sam", seats)).toMatchObject({ ok: false, code: "bad_seats" });
    }
    for (const seats of [2, 3, 4, 5, 6]) expect(rooms.create("Sam", seats)).toMatchObject({ ok: true });
    expect(rooms.size).toBe(5);
  });

  it("never reuses a code that is in use", () => {
    const rooms = fresh(7);
    const codes = new Set<string>();
    for (let i = 0; i < 300; i++) codes.add(ok(rooms.create(`P${i}`, 2)).code);
    expect(codes.size).toBe(300);
  });

  it("draws again when a code is taken, and says the server is busy only if it cannot find one", () => {
    // An rng that always spells the first letter four times gives one code, KKKK-style, over and over.
    const stuck = new RoomRegistry({ rng: () => 0 });
    expect(stuck.create("A", 2)).toMatchObject({ ok: true, code: CODE_ALPHABET[0]!.repeat(4) });
    expect(stuck.create("B", 2)).toMatchObject({ ok: false, code: "busy" });
    expect(stuck.size).toBe(1);
  });

  it("stops at a cap on rooms, so a flood cannot fill the server", () => {
    const rooms = fresh(1, 3);
    for (let i = 0; i < 3; i++) ok(rooms.create(`P${i}`, 2));
    expect(rooms.create("Late", 2)).toMatchObject({ ok: false, code: "busy" });
    expect(rooms.size).toBe(3);
  });
});

describe("joining a room", () => {
  it("adds people in order, whatever case or spacing they typed the code in", () => {
    const rooms = fresh();
    const made = ok(rooms.create("Sam", 4));
    const typed = made.code.toLowerCase().split("").join(" ");
    const joined = ok(rooms.join(typed, "  Alex "));
    expect(joined.code).toBe(made.code);
    expect(joined.lobby.players.map((p) => p.name)).toEqual(["Sam", "Alex"]);
    expect(joined.lobby.host).toBe(made.player);
    expect(joined.lobby.bots).toBe(2);
    expect(joined.player).not.toBe(made.player);
  });

  it("says why it cannot: a bad code, no such room, a full room, a bad or taken name", () => {
    const rooms = fresh();
    const made = ok(rooms.create("Sam", 2));
    expect(rooms.join("12", "A")).toMatchObject({ ok: false, code: "bad_code" });
    expect(rooms.join("BBBB", "A")).toMatchObject({ ok: false, code: "no_room" });
    expect(rooms.join(made.code, "")).toMatchObject({ ok: false, code: "bad_name" });
    expect(rooms.join(made.code, "sam")).toMatchObject({ ok: false, code: "name_taken" }); // case does not matter
    ok(rooms.join(made.code, "Alex"));
    expect(rooms.join(made.code, "Blake")).toMatchObject({ ok: false, code: "room_full" });
    expect(rooms.lobby(made.code)!.players).toHaveLength(2);
  });

  it("treats names that differ only in case, or in how an accent was typed, as the same", () => {
    const rooms = fresh();
    const made = ok(rooms.create("Zoë", 4));
    expect(rooms.join(made.code, "zoë")).toMatchObject({ ok: false, code: "name_taken" });
    expect(rooms.join(made.code, "ZOË")).toMatchObject({ ok: false, code: "name_taken" });
    expect(rooms.join(made.code, "Zoe")).toMatchObject({ ok: true }); // a different name
  });
});

describe("leaving a lobby", () => {
  it("passes the host to whoever has been there longest, and closes the room when it is empty", () => {
    const rooms = fresh();
    const a = ok(rooms.create("Ann", 4));
    const b = ok(rooms.join(a.code, "Bo"));
    const c = ok(rooms.join(a.code, "Cy"));

    const afterMiddle = rooms.leave(a.code, b.player);
    expect(afterMiddle).toMatchObject({ ok: true, closed: false });
    expect(rooms.lobby(a.code)!.host).toBe(a.player);

    const afterHost = rooms.leave(a.code, a.player);
    expect(afterHost).toMatchObject({ ok: true, closed: false });
    expect(rooms.lobby(a.code)).toMatchObject({ host: c.player, bots: 3 });

    expect(rooms.leave(a.code, c.player)).toEqual({ ok: true, closed: true });
    expect(rooms.size).toBe(0);
    expect(rooms.lobby(a.code)).toBeUndefined();
  });

  it("frees the name and the seat for someone else", () => {
    const rooms = fresh();
    const a = ok(rooms.create("Ann", 2));
    const b = ok(rooms.join(a.code, "Bo"));
    expect(rooms.join(a.code, "Cy")).toMatchObject({ ok: false, code: "room_full" });
    rooms.leave(a.code, b.player);
    expect(rooms.join(a.code, "Bo")).toMatchObject({ ok: true });
  });

  it("does nothing for someone who is not there, or a room that is not", () => {
    const rooms = fresh();
    const a = ok(rooms.create("Ann", 3));
    expect(rooms.leave(a.code, 9999)).toEqual({ ok: false });
    expect(rooms.leave("BBBB", a.player)).toEqual({ ok: false });
    expect(rooms.lobby(a.code)!.players).toHaveLength(1);
  });
});

describe("rooms under random use", () => {
  it("keep their promises however people come and go", () => {
    const rng = seededRng(42);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]!;
    const rooms = fresh(9, 6);
    const members = new Map<string, number[]>(); // code -> player ids, as the test expects them
    const names = ["Ann", "ann", "Bo", "Cy", "Di", "Ed", "Flo", "Gus", "", "\u0000"];

    for (let step = 0; step < 4000; step++) {
      const roll = rng();
      const codes = [...members.keys()];
      if (roll < 0.25 || codes.length === 0) {
        const res = rooms.create(pick(names), pick([1, 2, 3, 4, 5, 6, 7]));
        if (res.ok) members.set(res.code, [res.player]);
      } else if (roll < 0.7) {
        const code = pick(codes);
        const res = rooms.join(rng() < 0.9 ? code : "zzzz", pick(names));
        if (res.ok) members.get(code)!.push(res.player);
      } else {
        const code = pick(codes);
        const who = members.get(code)!;
        const player = rng() < 0.9 ? pick(who) : 123456;
        const res = rooms.leave(code, player);
        if (res.ok) {
          who.splice(who.indexOf(player), 1);
          if (who.length === 0) members.delete(code);
        }
      }

      // The invariants, after every step.
      expect(rooms.size).toBe(members.size);
      expect(rooms.size).toBeLessThanOrEqual(6);
      for (const [code, who] of members) {
        const lobby = rooms.lobby(code) as LobbyView;
        expect(lobby.players.map((p) => p.id)).toEqual(who);
        expect(lobby.players.length).toBeLessThanOrEqual(lobby.capacity);
        expect(lobby.capacity).toBeGreaterThanOrEqual(2);
        expect(lobby.capacity).toBeLessThanOrEqual(6);
        expect(lobby.host).toBe(who[0]);
        expect(lobby.bots).toBe(lobby.capacity - lobby.players.length);
        const lower = lobby.players.map((p) => p.name.toLowerCase());
        expect(new Set(lower).size).toBe(lower.length); // no two people share a name
      }
    }
  });
});
