import { afterEach, describe, expect, it } from "vitest";
import { seededRng } from "@liars-dice/engine";
import { WebSocket } from "ws";
import { GRACE_MS, Hub } from "../src/hub.ts";
import { FakeClock } from "./clock.ts";
import { listen } from "../src/socket.ts";
import { liveServer, playToEnd } from "./sockets.ts";

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

