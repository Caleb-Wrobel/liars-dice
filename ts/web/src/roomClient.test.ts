import { PROTOCOL_VERSION, type ClientMessage, type LobbyView, type ServerMessage } from "@liars-dice/engine";
import { describe, expect, it, vi } from "vitest";
import { NEWS_LINES, RoomClient } from "./roomClient.ts";
import { server } from "./test-server.ts";

const say = (message: object): ServerMessage => ({ v: PROTOCOL_VERSION, ...message }) as ServerMessage;

const lobbyOf = (people: [number, string][], host = people[0]![0], capacity = 4): LobbyView => ({
  code: "KTMR",
  capacity,
  host,
  players: people.map(([id, name]) => ({ id, name })),
  bots: capacity - people.length,
  lives: 3,
  advanced: false,
});
const joined = (you: number, lobby: LobbyView, more: object = {}) =>
  say({ type: "joined", code: "KTMR", token: "tok", you, lobby, ...more });
const lobbyMessage = (lobby: LobbyView) => say({ type: "lobby", lobby });

const JOIN: ClientMessage = { type: "join", code: "KTMR", name: "Sam" };

function make(request: ClientMessage = JOIN) {
  const sent: ClientMessage[] = [];
  const line = { up: true };
  const send = vi.fn((message: ClientMessage) => {
    if (line.up) sent.push(message);
    return line.up;
  });
  const client = new RoomClient(send, request);
  return { client, sent, line, state: () => client.getState() };
}

/** A client that has asked, been told it is in a lobby of Sam (host) and Alex, and is Alex. */
function inLobby() {
  const r = make();
  r.client.setStatus("open");
  r.client.receive(joined(2, lobbyOf([[1, "Sam"], [2, "Alex"]])));
  return r;
}

describe("RoomClient: asking for a room", () => {
  it("starts connecting, and sends its request once when the line first opens", () => {
    const { client, sent, state } = make();
    expect(state().phase).toBe("connecting");
    expect(sent).toEqual([]);
    client.setStatus("open");
    expect(sent).toEqual([JOIN]);
    expect(state().phase).toBe("joining");
  });

  it("sends a create just as it sends a join", () => {
    const create: ClientMessage = { type: "create", name: "Sam", seats: 4, lives: 3, advanced: false };
    const { client, sent } = make(create);
    client.setStatus("open");
    expect(sent).toEqual([create]);
  });

  it("does not send the request again when the line comes back after a drop", () => {
    const { client, sent } = make();
    client.setStatus("open");
    client.receive(joined(1, lobbyOf([[1, "Sam"]])));
    client.setStatus("reconnecting");
    client.setStatus("open");
    expect(sent).toEqual([JOIN]);
  });

  it("fails when the request cannot be sent at all", () => {
    const { client, line, state } = make();
    line.up = false;
    client.setStatus("open");
    expect(state().phase).toBe("failed");
    expect(state().error).toBe("Not connected.");
  });

  it("goes to the lobby when the server says joined, knowing the code, who it is and whether it hosts", () => {
    const guest = make();
    guest.client.setStatus("open");
    guest.client.receive(joined(2, lobbyOf([[1, "Sam"], [2, "Alex"]])));
    expect(guest.state()).toMatchObject({ phase: "lobby", code: "KTMR", you: 2, host: false });
    expect(guest.state().lobby?.players.map((p) => p.name)).toEqual(["Sam", "Alex"]);

    const host = make({ type: "create", name: "Sam", seats: 4 });
    host.client.setStatus("open");
    host.client.receive(joined(1, lobbyOf([[1, "Sam"]])));
    expect(host.state().host).toBe(true);
  });

  it("is refused, with the server's words, when it is told no while joining", () => {
    const { client, state } = make();
    client.setStatus("open");
    client.receive(say({ type: "error", code: "no_room", error: "there is no room with that code" }));
    expect(state()).toMatchObject({ phase: "refused", error: "there is no room with that code", lobby: null });
  });

  it("is refused too if the server answers before the line has been reported open", () => {
    const { client, state } = make();
    client.receive(say({ type: "error", code: "version", error: "reload the page" }));
    expect(state().phase).toBe("refused");
  });
});

describe("RoomClient: resuming a place from before a reload", () => {
  const resumed = () => {
    const sent: ClientMessage[] = [];
    const client = new RoomClient((m) => (sent.push(m), true), null);
    return { client, sent, state: () => client.getState() };
  };

  it("sends nothing of its own when the line opens: the connection sends the resume", () => {
    const { client, sent, state } = resumed();
    client.setStatus("open");
    expect(sent).toEqual([]);
    expect(state().phase).toBe("joining");
  });

  it("goes to the lobby when the place is a lobby, knowing who it is and whether it hosts", () => {
    const { client, state } = resumed();
    client.setStatus("open");
    client.receive(joined(1, lobbyOf([[1, "Sam"], [2, "Alex"]])));
    expect(state()).toMatchObject({ phase: "lobby", code: "KTMR", you: 1, host: true });
    expect(state().news).toEqual([]);
  });

  it("goes into the game when the place is in one", () => {
    const s = server();
    const { client, state } = resumed();
    client.setStatus("open");
    client.receive(joined(2, lobbyOf([[1, "Sam"], [2, "Alex"]]), { view: s.core.views()[1], kinds: s.seatKinds }));
    expect(state().phase).toBe("playing");
    expect(state().table!.getState().view).toEqual(s.core.views()[1]);
  });

  it("says the place is lost, not that a room turned it away, when the server no longer knows the token", () => {
    const { client, state } = resumed();
    client.setStatus("open");
    client.receive(say({ type: "error", code: "unknown_token", error: "that place is no longer yours" }));
    expect(state()).toMatchObject({ phase: "lost", error: "that place is no longer yours" });
  });

  it("says the same if the answer comes before the line has been reported open", () => {
    const { client, state } = resumed();
    client.receive(say({ type: "error", code: "unknown_token", error: "gone" }));
    expect(state().phase).toBe("lost");
  });
});

describe("RoomClient: the lobby", () => {
  it("follows the lobby, and says who came and went", () => {
    const { client, state } = inLobby();
    client.receive(lobbyMessage(lobbyOf([[1, "Sam"], [2, "Alex"], [3, "Kit"]])));
    client.receive(lobbyMessage(lobbyOf([[1, "Sam"], [3, "Kit"]])));
    expect(state().news).toEqual(["Kit joined", "Alex left"]);
    expect(state().lobby?.players.map((p) => p.name)).toEqual(["Sam", "Kit"]);
  });

  it("says who the new host is when the host leaves, and notices when it becomes the host", () => {
    const { client, state } = inLobby();
    expect(state().host).toBe(false);
    client.receive(lobbyMessage(lobbyOf([[2, "Alex"]], 2)));
    expect(state().news).toEqual(["Sam left", "Alex is now the host"]);
    expect(state().host).toBe(true);
  });

  it("says nothing about the people who were already there when it arrived", () => {
    expect(inLobby().state().news).toEqual([]);
  });

  it("keeps only the latest lines of news", () => {
    const { client, state } = inLobby();
    const people: [number, string][] = [[1, "Sam"], [2, "Alex"]];
    for (let i = 0; i < NEWS_LINES + 5; i++) {
      people.push([10 + i, `Guest${i}`]); // everyone stays, so each message adds exactly one line
      client.receive(lobbyMessage(lobbyOf(people)));
    }
    expect(state().news).toHaveLength(NEWS_LINES);
    expect(state().news.at(-1)).toBe(`Guest${NEWS_LINES + 4} joined`);
  });

  it("describes people by name and says nothing that assumes who anyone is", () => {
    const { client, state } = inLobby();
    client.receive(lobbyMessage(lobbyOf([[2, "Alex"]], 2)));
    for (const line of state().news) expect(line).not.toMatch(/\b(he|she|his|her|him)\b/i);
  });

  it("holds the server's refusal until the next message, which clears it", () => {
    const { client, state } = inLobby();
    client.receive(say({ type: "error", code: "illegal", error: "only the host can start the game" }));
    expect(state().error).toBe("only the host can start the game");
    expect(state().phase).toBe("lobby");
    client.receive(lobbyMessage(lobbyOf([[1, "Sam"], [2, "Alex"]])));
    expect(state().error).toBeNull();
  });

  it("sends start when the host presses it, and clears an old error as it does", () => {
    const { client, sent, state } = inLobby();
    client.receive(say({ type: "error", code: "illegal", error: "old" }));
    client.start();
    expect(sent.at(-1)).toEqual({ type: "start" });
    expect(state().error).toBeNull();
  });

  it("says so when a command cannot be sent", () => {
    const { client, line, state } = inLobby();
    line.up = false;
    client.start();
    expect(state().error).toBe("Not connected. Try again in a moment.");
  });

  it("sends leave, and ends the visit at once when that cannot be sent", () => {
    const ok = inLobby();
    ok.client.leave();
    expect(ok.sent.at(-1)).toEqual({ type: "leave" });
    expect(ok.state().phase).toBe("lobby"); // until the server says left

    const down = inLobby();
    down.line.up = false;
    down.client.leave();
    expect(down.state().phase).toBe("left");
  });

  it("ignores a lobby message when it is not in a lobby", () => {
    const { client, state } = make();
    client.setStatus("open");
    client.receive(lobbyMessage(lobbyOf([[1, "Sam"]])));
    expect(state().lobby).toBeNull();
    expect(state().phase).toBe("joining");
  });
});

describe("RoomClient: the game", () => {
  it("starts a table when the game starts, and hands the game's messages to it", () => {
    const s = server(1, ["Ann", "Bo", "Cy"]);
    const { client, state } = inLobby();
    client.receive(s.started(1));
    expect(state().phase).toBe("playing");
    expect(state().host).toBe(false);
    const table = state().table!;
    expect(table.getState().view).toEqual(s.core.views()[1]);
    client.receive(s.state(s.ok(0, { action: "roll" }), 1));
    expect(table.getState().log.at(-1)).toBe("Ann rolls the cup");
    expect(state().table).toBe(table); // the same table all game
  });

  it("gives a refusal during the game to the table, and does not leave the game", () => {
    const s = server();
    const { client, state } = inLobby();
    client.receive(s.started(1));
    client.receive(say({ type: "error", code: "illegal", error: "it is not your turn" }));
    expect(state().table!.getState().error).toBe("it is not your turn");
    expect(state().phase).toBe("playing");
    expect(state().error).toBeNull();
  });

  it("ignores a game message that arrives before there is a game", () => {
    const s = server();
    const { client, state } = inLobby();
    client.receive(s.state(s.ok(0, { action: "roll" }), 1));
    expect(state().table).toBeNull();
    expect(state().phase).toBe("lobby");
  });

  it("ignores a lobby message once the game is on", () => {
    const s = server();
    const { client, state } = inLobby();
    client.receive(s.started(1));
    const before = state();
    client.receive(lobbyMessage(lobbyOf([[1, "Sam"]])));
    expect(state()).toBe(before);
  });

  it("goes straight into the game when it resumes into one that has started, with nothing before it", () => {
    const s = server();
    const { client, state } = make();
    client.setStatus("open");
    client.receive(joined(2, lobbyOf([[1, "Sam"], [2, "Alex"]]), { view: s.core.views()[1], kinds: s.seatKinds }));
    expect(state().phase).toBe("playing");
    expect(state().code).toBe("KTMR");
    expect(state().table!.getState().view).toEqual(s.core.views()[1]);
  });

  it("gives a resume to the table it already has, and says the line is back", () => {
    const s = server();
    const { client, state } = inLobby();
    client.receive(s.started(1));
    client.setStatus("reconnecting");
    expect(state().reconnecting).toBe(true);
    const res = s.ok(0, { action: "roll" });
    client.receive(joined(2, lobbyOf([[1, "Sam"], [2, "Alex"]]), { view: res.views[1], kinds: s.seatKinds }));
    expect(state().table!.getState().view).toEqual(res.views[1]);
    expect(state().reconnecting).toBe(false);
  });
});

describe("RoomClient: the line", () => {
  it("says the line is being won back, and that it is back, without changing the phase", () => {
    const { client, state } = inLobby();
    client.setStatus("reconnecting");
    expect(state()).toMatchObject({ phase: "lobby", reconnecting: true });
    client.setStatus("open");
    expect(state()).toMatchObject({ phase: "lobby", reconnecting: false });
  });

  it("ignores a status of connecting, which is only the start", () => {
    const { client, state } = make();
    const before = state();
    client.setStatus("connecting");
    expect(state()).toBe(before);
  });

  it.each(["replaced", "lost", "outdated", "failed", "left"] as const)("ends in %s when the connection does", (status) => {
    const { client, state } = inLobby();
    client.setStatus("reconnecting");
    client.setStatus(status);
    expect(state().phase).toBe(status);
    expect(state().reconnecting).toBe(false);
  });

  it("counts a connection this side closed as having left", () => {
    const { client, state } = inLobby();
    client.setStatus("closed");
    expect(state().phase).toBe("left");
  });

  it("ends on the server's own word that it was replaced or has left", () => {
    const replaced = inLobby();
    replaced.client.receive(say({ type: "replaced" }));
    expect(replaced.state().phase).toBe("replaced");
    const left = inLobby();
    left.client.receive(say({ type: "left" }));
    expect(left.state().phase).toBe("left");
  });

  it("stays ended: nothing that arrives afterwards brings it back", () => {
    const s = server();
    const { client, state } = inLobby();
    client.setStatus("replaced");
    client.receive(lobbyMessage(lobbyOf([[1, "Sam"]])));
    client.receive(s.started(1));
    client.receive(joined(2, lobbyOf([[1, "Sam"], [2, "Alex"]])));
    client.setStatus("open");
    client.setStatus("reconnecting");
    expect(state().phase).toBe("replaced");
    expect(state().table).toBeNull();
    expect(state().reconnecting).toBe(false);
  });
});

describe("RoomClient: watching it change", () => {
  it("tells each listener once per change, and stops when one unsubscribes", () => {
    const { client, state } = make();
    const a = vi.fn();
    const b = vi.fn();
    client.subscribe(a);
    const stop = client.subscribe(b);
    const before = state();
    client.setStatus("open");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(state()).not.toBe(before);
    stop();
    client.receive(joined(1, lobbyOf([[1, "Sam"]])));
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1); // it had unsubscribed
  });

  it("lets a listener added during a notification wait for the next change", () => {
    const { client } = make();
    const late = vi.fn();
    let added = false;
    client.subscribe(() => {
      if (!added) {
        added = true;
        client.subscribe(late);
      }
    });
    client.setStatus("open");
    expect(late).not.toHaveBeenCalled();
    client.receive(joined(1, lobbyOf([[1, "Sam"]])));
    expect(late).toHaveBeenCalledTimes(1);
  });
});
