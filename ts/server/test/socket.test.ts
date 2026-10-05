import { afterEach, describe, expect, it, vi } from "vitest";
import { seededRng } from "@liars-dice/engine";
import { WebSocket } from "ws";
import { GRACE_MS, Hub } from "../src/hub.ts";
import { FakeClock } from "./clock.ts";
import { HEARTBEAT_MS, MAX_MESSAGE_BYTES, RATE_BURST, listen } from "../src/socket.ts";
import { LiveClient, liveServer, playToEnd } from "./sockets.ts";

type Live = Awaited<ReturnType<typeof liveServer>>;
let live: Live | null = null;
const start = async (seed = 1, hub?: Hub) => (live = await liveServer(seed, hub));
afterEach(async () => {
  await live?.stop();
  live = null;
});

/** Opens a socket, sends it something other than a JSON text frame, and says how the server closed it. */
async function closedBy(url: string, send: (ws: WebSocket) => void): Promise<number> {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => (ws.once("open", resolve), ws.once("error", reject)));
  const closed = new Promise<number>((resolve) => ws.once("close", (code) => resolve(code)));
  send(ws);
  return closed;
}

describe("over a real socket", () => {
  it("carries the protocol as JSON text, in both directions", async () => {
    const t = await start();
    const ann = await t.client();
    ann.send({ type: "create", name: "Ann", seats: 3 });
    await ann.until(() => ann.messages.length === 1);
    expect(ann.messages[0]).toMatchObject({ v: 1, type: "joined", lobby: { players: [{ name: "Ann" }] } });
    ann.ws.send("this is not a message", { binary: false }); // text, but not JSON
    await ann.until(() => ann.closed !== null);
    expect(ann.closed!.code).toBe(1007);
  });

  it("answers JSON that is not a valid message with an error and keeps the connection", async () => {
    const t = await start();
    const ann = await t.client();
    for (const raw of ['{"v":1,"type":"dance"}', "[1,2]", "null", '{"v":9,"type":"start"}']) ann.ws.send(raw);
    await ann.until(() => ann.messages.length === 4);
    expect(ann.all("error").map((e) => e.code)).toEqual(["malformed", "malformed", "malformed", "version"]);
    expect(ann.closed).toBeNull();
  });

  it("closes a connection that sends binary, or a broken frame, and the others carry on", async () => {
    const t = await start();
    const ann = await t.client();
    ann.send({ type: "create", name: "Ann", seats: 3 });
    await ann.sync();
    expect(await closedBy(t.url, (ws) => ws.send(Buffer.from([1, 2, 3]), { binary: true }))).toBe(1003);
    expect(await closedBy(t.url, (ws) => ws.send(Buffer.from([0xff, 0xfe]), { binary: false }))).toBe(1007); // not UTF-8
    await ann.sync();
    expect(ann.closed).toBeNull();
    expect(t.hub.roomCount).toBe(1);
  });

  it("closes only the one connection when the hub throws", async () => {
    const hub = new (class extends Hub {
      override receive(conn: number, raw: unknown): void {
        if ((raw as { type?: string }).type === "start") throw new Error("a bug");
        super.receive(conn, raw);
      }
    })({ rng: seededRng(1), clock: new FakeClock() });
    const t = await start(1, hub);
    const [ann, bo] = [await t.client(), await t.client()];
    ann.send({ type: "start" });
    await ann.until(() => ann.closed !== null);
    expect(ann.closed!.code).toBe(1011);
    await bo.sync();
    expect(bo.closed).toBeNull();
  });

  it("lets two people meet in a room, start, and play whole games to the same winner", async () => {
    for (const seed of [1, 2, 3]) {
      const t = await liveServer(seed);
      const [ann, bo] = [await t.client(), await t.client()];
      ann.send({ type: "create", name: "Ann", seats: 4, lives: 1 });
      await ann.until(() => ann.messages.length === 1);
      bo.send({ type: "join", code: ann.all("joined")[0]!.code, name: "Bo" });
      await bo.until(() => bo.messages.length === 1);
      ann.send({ type: "start" });
      await Promise.all([ann.until(() => ann.view !== undefined), bo.until(() => bo.view !== undefined)]);
      await playToEnd([ann, bo], t.clock);
      await Promise.all([ann.sync(), bo.sync()]);
      expect(ann.view!.winner).not.toBeNull();
      expect(bo.view!.winner).toBe(ann.view!.winner);
      for (const c of [ann, bo]) for (const m of [...c.all("started"), ...c.all("state")]) expect(m.view.you).toBe(c.view!.you);
      await t.stop();
    }
  });
});

describe("message size", () => {
  /** A message that is valid JSON of exactly this many bytes. */
  const padded = (bytes: number) => {
    const base = JSON.stringify({ v: 1, type: "intent", intent: "" });
    return JSON.stringify({ v: 1, type: "intent", intent: "x".repeat(bytes - base.length) });
  };

  it("allows a message right up to the limit, and closes the connection at one byte more", async () => {
    const t = await start();
    const ann = await t.client();
    const fine = padded(MAX_MESSAGE_BYTES);
    expect(fine.length).toBe(MAX_MESSAGE_BYTES);
    ann.ws.send(fine);
    await ann.until(() => ann.messages.length === 1);
    expect(ann.messages[0]).toMatchObject({ type: "error", code: "no_room" }); // read and judged by the hub
    const bo = await t.client();
    bo.ws.send(padded(MAX_MESSAGE_BYTES + 1));
    await bo.until(() => bo.closed !== null);
    expect(bo.closed!.code).toBe(1009);
    expect(bo.messages).toEqual([]);
    await ann.sync();
    expect(ann.closed).toBeNull();
  });

  it("can be set per server", async () => {
    const hub = new Hub({ rng: seededRng(1), clock: new FakeClock() });
    const server = await listen(hub, { port: 0, host: "127.0.0.1", maxMessageBytes: 100 });
    const closed = await closedBy(`ws://127.0.0.1:${server.port}/ws`, (ws) => ws.send(" ".repeat(101)));
    await server.close();
    expect(closed).toBe(1009);
  });
});

describe("message rate", () => {
  const junk = '{"v":1,"type":"dance"}'; // always answered with an error, so it can be counted

  it("lets a burst through, earns more back with time, and closes a connection that sends faster than that", async () => {
    let now = 0;
    const hub = new Hub({ rng: seededRng(1), clock: new FakeClock() });
    const server = await listen(hub, { port: 0, host: "127.0.0.1", rateBurst: 4, ratePerSecond: 2, now: () => now });
    const ann = await LiveClient.open(`ws://127.0.0.1:${server.port}/ws`);
    const sendMany = async (n: number) => {
      const before = ann.messages.length;
      for (let i = 0; i < n; i++) ann.ws.send(junk);
      await ann.until(() => ann.messages.length === before + n);
    };
    await sendMany(4);
    now = 1000; // two tokens back
    await sendMany(2);
    expect(ann.closed).toBeNull();
    ann.ws.send(junk);
    await ann.until(() => ann.closed !== null);
    expect(ann.closed!.code).toBe(1008);
    expect(ann.messages).toHaveLength(6); // the one over the limit got no answer
    await server.close();
  });

  it("counts each connection on its own, and has a default that a person never reaches", async () => {
    const hub = new Hub({ rng: seededRng(1), clock: new FakeClock() });
    const server = await listen(hub, { port: 0, host: "127.0.0.1" });
    const t = { client: () => LiveClient.open(`ws://127.0.0.1:${server.port}/ws`) };
    const [ann, bo] = [await t.client(), await t.client()];
    for (let i = 0; i < RATE_BURST; i++) ann.ws.send(junk);
    await ann.until(() => ann.messages.length === RATE_BURST);
    ann.ws.send(junk);
    await ann.until(() => ann.closed !== null);
    expect(ann.closed!.code).toBe(1008);
    await bo.sync();
    expect(bo.closed).toBeNull();
    await server.close();
  });
});

describe("the heartbeat", () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const beating = async (ms: number) => {
    const hub = new Hub({ rng: seededRng(1), clock: new FakeClock() });
    const server = await listen(hub, { port: 0, host: "127.0.0.1", heartbeatMs: ms });
    return { hub, server, url: `ws://127.0.0.1:${server.port}/ws` };
  };

  it("leaves alone a connection that answers, however long it lasts", async () => {
    const t = await beating(30);
    const ann = await LiveClient.open(t.url); // a browser answers a ping on its own
    await sleep(300); // ten rounds
    expect(ann.closed).toBeNull();
    await ann.sync();
    await t.server.close();
  });

  it("cuts one that stops answering, within two rounds, and the hub starts its absence window", async () => {
    const t = await beating(40);
    const [mute, ann] = [await LiveClient.open(t.url, { autoPong: false }), await LiveClient.open(t.url)];
    mute.send({ type: "create", name: "Mute", seats: 3 });
    await mute.until(() => mute.messages.length === 1);
    const started = Date.now();
    await mute.until(() => mute.closed !== null, "the silent connection to be cut");
    expect(Date.now() - started).toBeLessThan(40 * 2 + 200);
    expect(mute.closed!.code).toBe(1006); // dropped, not asked to close: a dead peer could never answer a goodbye
    expect(t.hub.roomCount).toBe(1); // held for the window, not gone at once
    expect(ann.closed).toBeNull();
    await t.server.close();
  });

  it("starts the window: after it, the dead connection's place is freed", async () => {
    const clock = new FakeClock();
    const hub = new Hub({ rng: seededRng(1), clock });
    const server = await listen(hub, { port: 0, host: "127.0.0.1", heartbeatMs: 30 });
    const mute = await LiveClient.open(`ws://127.0.0.1:${server.port}/ws`, { autoPong: false });
    mute.send({ type: "create", name: "Mute", seats: 3 });
    await mute.until(() => mute.closed !== null);
    await sleep(20);
    clock.advance(GRACE_MS);
    expect(hub.roomCount).toBe(0);
    await server.close();
  });

  it("stops when the server does, and by default beats every 20 seconds", async () => {
    const clear = vi.spyOn(globalThis, "clearInterval");
    const t = await beating(30);
    await t.server.close();
    expect(clear).toHaveBeenCalledTimes(1);
    clear.mockRestore();
    expect(HEARTBEAT_MS).toBe(20_000);
  });
});

describe("the origin check", () => {
  /** A hub that counts the connections it is told about, so a refused handshake can be seen never to reach it. */
  const counting = () => {
    const seen = { connections: 0 };
    const hub = new (class extends Hub {
      override connect(send: Parameters<Hub["connect"]>[0]) {
        seen.connections++;
        return super.connect(send);
      }
    })({ rng: seededRng(1), clock: new FakeClock() });
    return { hub, seen };
  };
  const refusedWith = (url: string, origin: string) =>
    new Promise<number | undefined>((resolve) => {
      const ws = new WebSocket(url, { origin });
      ws.once("unexpected-response", (_req, res) => resolve(res.statusCode));
      ws.once("open", () => resolve(undefined));
      ws.once("error", () => {});
    });

  it("lets in a page from a listed site, and refuses every other with a 403 before the hub hears of it", async () => {
    const { hub, seen } = counting();
    const server = await listen(hub, { port: 0, host: "127.0.0.1", allowedOrigins: ["https://game.example"] });
    const url = `ws://127.0.0.1:${server.port}/ws`;
    const ann = await LiveClient.open(url, { origin: "https://game.example" });
    ann.send({ type: "create", name: "Ann", seats: 3 });
    await ann.until(() => ann.messages.length === 1);
    expect(seen.connections).toBe(1);
    expect(await refusedWith(url, "https://evil.example")).toBe(403);
    expect(await refusedWith(url, "http://game.example")).toBe(403);
    expect(await refusedWith(url, "null")).toBe(403);
    expect(seen.connections).toBe(1);
    await server.close();
  });

  it("lets in a connection with no origin, as a script or a test sends", async () => {
    const { hub, seen } = counting();
    const server = await listen(hub, { port: 0, host: "127.0.0.1", allowedOrigins: ["https://game.example"] });
    const ann = await LiveClient.open(`ws://127.0.0.1:${server.port}/ws`);
    ann.send({ type: "create", name: "Ann", seats: 3 });
    await ann.until(() => ann.messages.length === 1);
    expect(seen.connections).toBe(1);
    await server.close();
  });

  it("refuses every browser when no sites are listed", async () => {
    const { hub } = counting();
    const server = await listen(hub, { port: 0, host: "127.0.0.1" });
    expect(await refusedWith(`ws://127.0.0.1:${server.port}/ws`, "https://game.example")).toBe(403);
    await server.close();
  });
});

describe("closing a socket", () => {
  it("is a drop: the place is held for the window, then freed", async () => {
    const t = await start();
    const [ann, bo] = [await t.client(), await t.client()];
    ann.send({ type: "create", name: "Ann", seats: 3 });
    await ann.until(() => ann.messages.length === 1);
    bo.send({ type: "join", code: ann.all("joined")[0]!.code, name: "Bo" });
    await bo.until(() => bo.messages.length === 1);
    await ann.until(() => ann.all("lobby").length === 1);
    await bo.close();
    await new Promise((r) => setTimeout(r, 20)); // the server learns of the close a moment after the client does
    t.clock.advance(GRACE_MS);
    await ann.until(() => ann.all("lobby").length === 2);
    expect(ann.all("lobby")[1]!.lobby.players.map((p) => p.name)).toEqual(["Ann"]);
  });

  it("can be undone from a new socket, and the old one is closed as replaced", async () => {
    const t = await start();
    const old = await t.client();
    old.send({ type: "create", name: "Ann", seats: 3 });
    await old.until(() => old.messages.length === 1);
    const fresh = await t.client();
    fresh.send({ type: "resume", token: old.token });
    await fresh.until(() => fresh.all("joined").length === 1);
    await old.until(() => old.closed !== null);
    expect(old.all("replaced")).toHaveLength(1);
    expect(old.closed).toEqual({ code: 1000, reason: "replaced" });
    expect(fresh.closed).toBeNull();
    await fresh.sync();
    expect(t.hub.roomCount).toBe(1);
  });

  it("is what stopping the server does to every connection", async () => {
    const t = await start();
    const ann = await t.client();
    ann.send({ type: "create", name: "Ann", seats: 3 });
    await ann.until(() => ann.messages.length === 1);
    await t.stop();
    await ann.until(() => ann.closed !== null);
    await expect(new Promise((resolve, reject) => (new WebSocket(t.url).once("open", resolve).once("error", reject)))).rejects.toBeDefined();
    live = null;
  });
});

describe("the address", () => {
  it("answers only on its path", async () => {
    const t = await start();
    const code = await new Promise<number | undefined>((resolve) => {
      const ws = new WebSocket(t.url.replace("/ws", "/elsewhere"));
      ws.once("unexpected-response", (_req, res) => resolve(res.statusCode));
      ws.once("error", () => {});
    });
    expect(code).toBe(400);
  });

  it("reports the port it was given, or the one it found", async () => {
    const t = await start();
    expect(t.server.port).toBeGreaterThan(0);
    const again = await listen(t.hub, { port: t.server.port, host: "127.0.0.1" }).then(() => "listening", (e: Error) => e.message);
    expect(again).toMatch(/EADDRINUSE/); // a failure to listen is reported, not swallowed
  });
});

