import { PROTOCOL_VERSION, type ServerMessage } from "@liars-dice/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Connection, GIVE_UP_MS, RETRY_FIRST_MS, RETRY_MAX_MS, type SocketLike, type Status } from "./connection.ts";

class FakeSocket implements SocketLike {
  onopen: ((event: Event) => unknown) | null = null;
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  onclose: ((event: CloseEvent) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;
  sent: unknown[] = [];
  closedWith: number | null = null;
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number) {
    this.closedWith = code ?? 1005;
    this.drop(code ?? 1005); // a real socket reports the close it was asked for, which the client must ignore
  }
  /** The line opens. */
  open() {
    this.onopen?.(new Event("open"));
  }
  /** The server says something. */
  say(message: object) {
    this.raw(JSON.stringify({ v: PROTOCOL_VERSION, ...message }));
  }
  /** The server sends exactly this, whatever it is. */
  raw(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
  /** The line drops, or the server closes it. */
  drop(code = 1006) {
    this.onclose?.(new CloseEvent("close", { code }));
  }
}

const joined = (token = "tok-1") => ({ type: "joined", code: "ABCD", token, you: 0, lobby: {} });

interface Rig {
  sockets: FakeSocket[];
  statuses: Status[];
  messages: ServerMessage[];
  conn: Connection;
  /** The newest socket. */
  now: () => FakeSocket;
}

function rig(options: { token?: string; rng?: () => number } = {}): Rig {
  const sockets: FakeSocket[] = [];
  const statuses: Status[] = [];
  const messages: ServerMessage[] = [];
  const conn = new Connection({
    url: "ws://test/ws",
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    open: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    rng: options.rng ?? (() => 1), // the full wait, so the delays below are exact
    ...(options.token === undefined ? {} : { token: options.token }),
  });
  return { sockets, statuses, messages, conn, now: () => sockets[sockets.length - 1]! };
}

/** A connection that has joined and holds a token. */
function joinedRig(options: Parameters<typeof rig>[0] = {}): Rig {
  const r = rig(options);
  r.now().open();
  r.now().say(joined());
  r.statuses.length = 0;
  r.messages.length = 0;
  return r;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Connection: opening", () => {
  it("starts connecting, opens when the line does, and sends what it is given", () => {
    const r = rig();
    expect(r.conn.status).toBe("connecting");
    expect(r.sockets[0]!.url).toBe("ws://test/ws");
    r.now().open();
    expect(r.conn.status).toBe("open");
    expect(r.conn.send({ type: "join", code: "ABCD", name: "Sam" })).toBe(true);
    expect(r.now().sent).toEqual([{ v: PROTOCOL_VERSION, type: "join", code: "ABCD", name: "Sam" }]);
  });

  it("puts the protocol version on every message, which the server refuses to read without", () => {
    const r = joinedRig();
    r.conn.send({ type: "start" });
    r.conn.send({ type: "intent", intent: { action: "pull" } });
    r.now().drop();
    vi.advanceTimersByTime(RETRY_FIRST_MS);
    r.now().open(); // the resume goes out by itself
    const all = [...r.sockets.flatMap((socket) => socket.sent)] as { v?: unknown; type: string }[];
    expect(all.map((m) => m.type)).toEqual(["start", "intent", "resume"]);
    for (const message of all) expect(message.v).toBe(PROTOCOL_VERSION);
  });

  it("refuses to send before the line is open", () => {
    const r = rig();
    expect(r.conn.send({ type: "start" })).toBe(false);
    expect(r.now().sent).toEqual([]);
  });

  it("opens a real WebSocket unless told otherwise", () => {
    const made: string[] = [];
    vi.stubGlobal(
      "WebSocket",
      class extends FakeSocket {
        constructor(url: string) {
          super(url);
          made.push(url);
        }
      },
    );
    new Connection({ url: "ws://real/ws", onMessage: () => {}, onStatus: () => {} });
    expect(made).toEqual(["ws://real/ws"]);
  });

  it("ignores a socket error, since the close that follows is what counts", () => {
    const r = rig();
    r.now().onerror?.(new Event("error"));
    expect(r.statuses).toEqual([]);
    expect(r.conn.status).toBe("connecting");
  });

  it("fails when the line drops before the player has joined anything", () => {
    const r = rig();
    r.now().drop();
    expect(r.conn.status).toBe("failed");
    vi.advanceTimersByTime(GIVE_UP_MS);
    expect(r.sockets).toHaveLength(1); // nothing to resume, so nothing is retried
  });
});

describe("Connection: messages", () => {
  it("hands on what the server says, and keeps the token from joined", () => {
    const r = rig();
    r.now().open();
    expect(r.conn.token).toBeUndefined();
    r.now().say(joined("secret"));
    r.now().say({ type: "lobby", lobby: {} });
    expect(r.messages.map((m) => m.type)).toEqual(["joined", "lobby"]);
    expect(r.conn.token).toBe("secret");
  });

  it("reports a status only when it changes", () => {
    const r = rig();
    r.now().open();
    r.now().say(joined());
    r.now().say(joined("tok-2")); // already open
    expect(r.statuses).toEqual(["open"]);
    expect(r.conn.token).toBe("tok-2");
  });

  it.each([
    ["text that is not JSON", "nonsense"],
    ["binary data", new ArrayBuffer(4)],
    ["JSON that is not an object", "42"],
    ["JSON with no type", JSON.stringify({ v: PROTOCOL_VERSION })],
    ["null", "null"],
  ])("fails on %s and closes the line", (_name, data) => {
    const r = joinedRig();
    r.now().raw(data);
    expect(r.conn.status).toBe("failed");
    expect(r.sockets[0]!.closedWith).toBe(1000);
    expect(r.messages).toEqual([]);
  });

  it("stops, and does not retry, when the server speaks another protocol version", () => {
    const r = joinedRig();
    r.now().raw(JSON.stringify({ v: PROTOCOL_VERSION + 1, type: "state" }));
    expect(r.conn.status).toBe("outdated");
    expect(r.messages).toEqual([]);
    r.now().drop();
    vi.advanceTimersByTime(GIVE_UP_MS);
    expect(r.sockets).toHaveLength(1);
  });

  it("fails on a message that carries no version at all", () => {
    const r = joinedRig();
    r.now().raw(JSON.stringify({ type: "state" }));
    expect(r.conn.status).toBe("outdated");
  });
});

describe("Connection: reconnecting", () => {
  it("retries after a drop and resumes the place with the token", () => {
    const r = joinedRig();
    r.now().drop();
    expect(r.conn.status).toBe("reconnecting");
    expect(r.sockets).toHaveLength(1);
    vi.advanceTimersByTime(RETRY_FIRST_MS - 1);
    expect(r.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(r.sockets).toHaveLength(2);
    r.now().open();
    expect(r.now().sent).toEqual([{ v: PROTOCOL_VERSION, type: "resume", token: "tok-1" }]);
    expect(r.conn.status).toBe("reconnecting"); // not ours again until the server says so
    r.now().say(joined());
    expect(r.conn.status).toBe("open");
    expect(r.statuses).toEqual(["reconnecting", "open"]);
  });

  it("will not send while reconnecting, nor while the resume is unanswered", () => {
    const r = joinedRig();
    r.now().drop();
    expect(r.conn.send({ type: "start" })).toBe(false);
    vi.advanceTimersByTime(RETRY_FIRST_MS);
    expect(r.conn.send({ type: "start" })).toBe(false);
    r.now().open();
    expect(r.conn.send({ type: "start" })).toBe(false);
    expect(r.now().sent).toEqual([{ v: PROTOCOL_VERSION, type: "resume", token: "tok-1" }]); // only the resume
    r.now().say(joined());
    expect(r.conn.send({ type: "start" })).toBe(true);
  });

  it("waits twice as long each time, up to a ceiling", () => {
    const r = joinedRig();
    r.now().drop();
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      let waited = 0;
      const before = r.sockets.length;
      while (r.sockets.length === before && waited <= RETRY_MAX_MS) {
        vi.advanceTimersByTime(1);
        waited++;
      }
      waits.push(waited);
      r.now().drop(); // the retry never connects
    }
    expect(waits).toEqual([500, 1000, 2000, 4000, RETRY_MAX_MS, RETRY_MAX_MS, RETRY_MAX_MS]);
  });

  it("spreads the wait with jitter, between half and the whole", () => {
    const r = joinedRig({ rng: () => 0 });
    r.now().drop();
    vi.advanceTimersByTime(RETRY_FIRST_MS / 2 - 1);
    expect(r.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(r.sockets).toHaveLength(2);
  });

  it("starts the waits over after a successful resume", () => {
    const r = joinedRig();
    r.now().drop();
    vi.advanceTimersByTime(RETRY_FIRST_MS);
    r.now().drop(); // second drop, so the next wait is a doubled one
    vi.advanceTimersByTime(RETRY_FIRST_MS * 2);
    r.now().open();
    r.now().say(joined());
    r.now().drop();
    const before = r.sockets.length;
    vi.advanceTimersByTime(RETRY_FIRST_MS);
    expect(r.sockets).toHaveLength(before + 1);
  });

  it.each([1006, 1001, 1011, 1000])("retries after close code %i", (code) => {
    const r = joinedRig();
    r.now().drop(code);
    expect(r.conn.status).toBe("reconnecting");
    vi.advanceTimersByTime(RETRY_FIRST_MS);
    expect(r.sockets).toHaveLength(2);
  });

  it.each([1003, 1007, 1008, 1009])("does not retry after close code %i, which says the server refused us", (code) => {
    const r = joinedRig();
    r.now().drop(code);
    expect(r.conn.status).toBe("failed");
    vi.advanceTimersByTime(GIVE_UP_MS);
    expect(r.sockets).toHaveLength(1);
  });

  it("gives up once the place cannot be held any longer", () => {
    const r = joinedRig();
    r.now().drop();
    // Every retry fails to connect, as when the server is down.
    for (let t = 0; t < GIVE_UP_MS - 1000; t += 1000) {
      vi.advanceTimersByTime(1000);
      r.now().drop(); // the newest socket never opened; dropping it again is harmless while an older one is stale
    }
    expect(r.conn.status).toBe("reconnecting");
    vi.advanceTimersByTime(1000);
    expect(r.conn.status).toBe("lost");
    const made = r.sockets.length;
    vi.advanceTimersByTime(GIVE_UP_MS);
    expect(r.sockets).toHaveLength(made);
  });

  it("counts the time from the first drop, not from each failed attempt", () => {
    const r = joinedRig();
    r.now().drop();
    vi.advanceTimersByTime(GIVE_UP_MS - 1);
    r.now().drop(); // another failed attempt right at the end must not buy more time
    vi.advanceTimersByTime(1);
    expect(r.conn.status).toBe("lost");
  });

  it("gives a fresh window for a later drop once the place is back", () => {
    const r = joinedRig();
    r.now().drop();
    vi.advanceTimersByTime(RETRY_FIRST_MS);
    r.now().open();
    r.now().say(joined());
    vi.advanceTimersByTime(GIVE_UP_MS); // time passes while connected
    expect(r.conn.status).toBe("open");
    r.now().drop();
    vi.advanceTimersByTime(GIVE_UP_MS - 1);
    expect(r.conn.status).toBe("reconnecting");
    vi.advanceTimersByTime(1);
    expect(r.conn.status).toBe("lost"); // and the window really does start again
  });

  it("does not let the clock of an earlier drop run out after the place is back", () => {
    const r = joinedRig();
    r.now().drop();
    vi.advanceTimersByTime(RETRY_FIRST_MS);
    r.now().drop(); // a second failed attempt in the same outage
    vi.advanceTimersByTime(RETRY_FIRST_MS * 2);
    r.now().open();
    r.now().say(joined());
    vi.advanceTimersByTime(GIVE_UP_MS * 2);
    expect(r.conn.status).toBe("open");
  });

  it("stops the clock for giving up once the place is back", () => {
    const r = joinedRig();
    r.now().drop();
    vi.advanceTimersByTime(RETRY_FIRST_MS);
    r.now().open();
    r.now().say(joined());
    vi.advanceTimersByTime(GIVE_UP_MS * 2);
    expect(r.conn.status).toBe("open");
  });

  it("is lost when the server no longer knows the token", () => {
    const r = joinedRig();
    r.now().drop();
    vi.advanceTimersByTime(RETRY_FIRST_MS);
    r.now().open();
    r.now().say({ type: "error", code: "unknown_token", error: "that place is no longer yours" });
    expect(r.conn.status).toBe("lost");
    expect(r.messages.map((m) => m.type)).toEqual(["error"]); // the owner still hears why
    expect(r.sockets[1]!.closedWith).toBe(1000);
    vi.advanceTimersByTime(GIVE_UP_MS);
    expect(r.sockets).toHaveLength(2);
  });

  it("treats an error that does not answer a resume as an ordinary message", () => {
    const r = joinedRig();
    r.now().say({ type: "error", code: "not_your_turn", error: "wait" });
    expect(r.conn.status).toBe("open");
    expect(r.messages.map((m) => m.type)).toEqual(["error"]);
  });

  it("treats an error after a resume has been answered as an ordinary message too", () => {
    const r = joinedRig();
    r.now().drop();
    vi.advanceTimersByTime(RETRY_FIRST_MS);
    r.now().open();
    r.now().say(joined());
    r.now().say({ type: "error", code: "not_your_turn", error: "wait" });
    expect(r.conn.status).toBe("open");
  });

  it("ignores what an older socket says once a newer one has taken over", () => {
    const r = joinedRig();
    const old = r.now();
    old.drop();
    vi.advanceTimersByTime(RETRY_FIRST_MS);
    old.say({ type: "state" });
    old.drop(1003);
    old.open();
    expect(r.messages).toEqual([]);
    expect(r.conn.status).toBe("reconnecting");
    expect(old.sent).toEqual([]);
  });
});

describe("Connection: resuming with a token from before", () => {
  it("resumes as soon as the line opens, and is open when the server answers", () => {
    const r = rig({ token: "saved" });
    expect(r.conn.status).toBe("connecting");
    expect(r.conn.token).toBe("saved");
    r.now().open();
    expect(r.now().sent).toEqual([{ v: PROTOCOL_VERSION, type: "resume", token: "saved" }]);
    expect(r.conn.status).toBe("connecting");
    r.now().say(joined("fresh"));
    expect(r.conn.status).toBe("open");
    expect(r.conn.token).toBe("fresh");
  });

  it("is lost, not failed, when the old token is refused", () => {
    const r = rig({ token: "stale" });
    r.now().open();
    r.now().say({ type: "error", code: "unknown_token", error: "gone" });
    expect(r.conn.status).toBe("lost");
  });

  it("retries a first connection that drops, since there is a place to win back", () => {
    const r = rig({ token: "saved" });
    r.now().drop();
    expect(r.conn.status).toBe("reconnecting");
    vi.advanceTimersByTime(RETRY_FIRST_MS);
    expect(r.sockets).toHaveLength(2);
  });
});

describe("Connection: ending", () => {
  it("is replaced when a newer connection takes the place, and then stays put", () => {
    const r = joinedRig();
    r.now().say({ type: "replaced" });
    expect(r.conn.status).toBe("replaced");
    expect(r.messages.map((m) => m.type)).toEqual(["replaced"]);
    r.now().drop(1000); // the server closes after sending it
    vi.advanceTimersByTime(GIVE_UP_MS);
    expect(r.sockets).toHaveLength(1);
    expect(r.conn.status).toBe("replaced");
  });

  it("is left when the server confirms the player left, and closes its end", () => {
    const r = joinedRig();
    r.now().say({ type: "left" });
    expect(r.conn.status).toBe("left");
    expect(r.messages.map((m) => m.type)).toEqual(["left"]);
    expect(r.sockets[0]!.closedWith).toBe(1000);
    r.now().drop(1000);
    vi.advanceTimersByTime(GIVE_UP_MS);
    expect(r.sockets).toHaveLength(1);
  });

  it("closes for good when told to, cancelling any retry", () => {
    const r = joinedRig();
    r.now().drop();
    r.conn.close();
    expect(r.conn.status).toBe("closed");
    vi.advanceTimersByTime(GIVE_UP_MS * 2);
    expect(r.sockets).toHaveLength(1);
    expect(r.conn.status).toBe("closed"); // the give-up clock did not run either
    expect(r.statuses).toEqual(["reconnecting", "closed"]);
  });

  it("closes an open line when told to", () => {
    const r = joinedRig();
    r.conn.close();
    expect(r.sockets[0]!.closedWith).toBe(1000);
    expect(r.conn.send({ type: "start" })).toBe(false);
    r.now().drop(1000);
    expect(r.conn.status).toBe("closed");
  });

  it("keeps its first final status", () => {
    const r = joinedRig();
    r.now().say({ type: "replaced" });
    r.conn.close();
    expect(r.conn.status).toBe("replaced");
    expect(r.statuses).toEqual(["replaced"]);
  });
});
