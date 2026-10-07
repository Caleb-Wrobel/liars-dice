import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION } from "@liars-dice/engine";
import { readFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

/**
 * The real server, built the way `npm run build` builds it and started the way `npm start` starts it, on a port the
 * system picks. These check what the unit tests cannot: that the environment reaches the hub and the socket, that a
 * browser from another site is turned away at the door, and that stopping it is clean.
 */
const serverDir = fileURLToPath(new URL("..", import.meta.url));
const children: ChildProcess[] = [];

beforeAll(() => {
  execFileSync("npm", ["run", "build"], { cwd: serverDir, stdio: "pipe" });
}, 60_000);

afterEach(() => {
  for (const child of children.splice(0)) child.kill("SIGKILL");
});
afterAll(() => {
  for (const child of children.splice(0)) child.kill("SIGKILL");
});

interface Running {
  readonly port: number;
  readonly child: ChildProcess;
  stdout(): string;
  stderr(): string;
  exited(): Promise<number | null>;
}

/** Starts the built server with this environment and waits until it says where it is listening. */
function start(env: Record<string, string>): Promise<Running> {
  const child = spawn("node", ["dist/server.mjs"], {
    cwd: serverDir,
    env: { PATH: process.env.PATH ?? "", PORT: "0", ...env },
  });
  children.push(child);
  let out = "";
  let err = "";
  child.stdout!.on("data", (chunk) => (out += chunk));
  child.stderr!.on("data", (chunk) => (err += chunk));
  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no listening line; stdout: ${out}; stderr: ${err}`)), 15_000);
    const check = setInterval(() => {
      const match = /listening on [^:]+:(\d+)/.exec(out);
      if (match) {
        clearTimeout(timer);
        clearInterval(check);
        resolve({ port: Number(match[1]), child, stdout: () => out, stderr: () => err, exited: () => exited });
      }
    }, 25);
    void exited.then(() => {
      clearTimeout(timer);
      clearInterval(check);
      reject(new Error(`exited early; stderr: ${err}`));
    });
  });
}

/** Opens a socket and says what happened: the first message the server sent, or that it was refused with a status. */
function connect(
  port: number,
  origin?: string,
  where: { host?: string; path?: string } = {},
): Promise<{ first?: Record<string, unknown>; refused?: number; failed?: boolean }> {
  return new Promise((resolve, reject) => {
    const url = `ws://${where.host ?? "127.0.0.1"}:${port}${where.path ?? "/ws"}`;
    const ws = new WebSocket(url, origin === undefined ? {} : { headers: { Origin: origin } });
    const timer = setTimeout(() => reject(new Error("no answer")), 10_000);
    ws.on("open", () => ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "create", name: "Sam", seats: 3 })));
    ws.on("message", (data) => {
      clearTimeout(timer);
      ws.close();
      resolve({ first: JSON.parse(data.toString()) as Record<string, unknown> });
    });
    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      resolve({ refused: res.statusCode ?? 0 });
    });
    // A refusal also raises this, and the response above is what is reported; with no response at all, nothing was there.
    ws.on("error", () => setTimeout(() => resolve({ failed: true }), 50));
  });
}

/** A port nothing is using right now, found by asking the system for one and giving it back. */
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

describe("the server's start-up order", () => {
  // A stop signal that arrives between the server saying it is listening and the handlers being set up kills the
  // process outright. That window is a few microseconds wide, so it cannot be hit on purpose; the order that closes it
  // is checked here instead, in the source.
  it("sets up stopping before it listens, and so before it says it is listening", () => {
    const source = readFileSync(fileURLToPath(new URL("../src/main.ts", import.meta.url)), "utf8");
    const handlers = source.indexOf('process.on(signal');
    expect(handlers).toBeGreaterThan(-1);
    expect(handlers).toBeLessThan(source.indexOf("await listen("));
    expect(handlers).toBeLessThan(source.indexOf("listening on"));
  });
});

describe("the server, as started", () => {
  it("listens on the port it was given", async () => {
    const port = await freePort(); // every other test lets the system choose, which would hide a port that is ignored
    const server = await start({ PORT: String(port) });
    expect(server.port).toBe(port);
    expect((await connect(port)).first).toMatchObject({ type: "joined" });
  }, 30_000);

  it("serves the game to a client that is not a browser, and stops cleanly when told to", async () => {
    const server = await start({});
    const { first } = await connect(server.port);
    expect(first).toMatchObject({ type: "joined", you: expect.any(Number) });
    expect(String(first!.code)).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    server.child.kill("SIGTERM");
    expect(await server.exited()).toBe(0);
  }, 30_000);

  it("stops cleanly on Ctrl-C too", async () => {
    const server = await start({});
    server.child.kill("SIGINT");
    expect(await server.exited()).toBe(0);
  }, 30_000);

  it.runIf(process.platform === "linux")("listens on the address it was given, and on no other", async () => {
    // Any 127.x.y.z address is this machine on Linux, so the one that was not asked for shows whether it listens widely.
    const server = await start({ HOST: "127.0.0.2" });
    expect((await connect(server.port, undefined, { host: "127.0.0.2" })).first).toMatchObject({ type: "joined" });
    expect((await connect(server.port, undefined, { host: "127.0.0.1" })).failed).toBe(true);
  }, 30_000);

  it.runIf(process.platform === "linux")("listens on this machine alone unless told otherwise", async () => {
    const server = await start({});
    expect(server.stdout()).toContain("listening on 127.0.0.1:");
    expect((await connect(server.port, undefined, { host: "127.0.0.1" })).first).toMatchObject({ type: "joined" });
    expect((await connect(server.port, undefined, { host: "127.0.0.2" })).failed).toBe(true);
  }, 30_000);

  it("speaks the protocol at the path it was given, and nowhere else", async () => {
    const server = await start({ WS_PATH: "/play" });
    expect((await connect(server.port, undefined, { path: "/play" })).first).toMatchObject({ type: "joined" });
    expect((await connect(server.port, undefined, { path: "/ws" })).refused ?? 0).toBeGreaterThanOrEqual(400);
  }, 30_000);

  it("turns away a browser from a site that is not on the list, and lets in one that is", async () => {
    const server = await start({ ALLOWED_ORIGINS: "http://localhost:5173" });
    expect((await connect(server.port, "http://evil.example")).refused).toBeGreaterThanOrEqual(400);
    expect((await connect(server.port, "http://localhost:5173")).first).toMatchObject({ type: "joined" });
  }, 30_000);

  it("turns away every browser when nothing is listed, and says so", async () => {
    const server = await start({});
    expect((await connect(server.port, "http://localhost:5173")).refused).toBeGreaterThanOrEqual(400);
    expect(server.stderr()).toContain("ALLOWED_ORIGINS is empty");
  }, 30_000);

  it("refuses to start with a setting it cannot use, and says which, without a stack trace", async () => {
    const child = spawn("node", ["dist/server.mjs"], { cwd: serverDir, env: { PATH: process.env.PATH ?? "", PORT: "eighty" } });
    children.push(child);
    let err = "";
    child.stderr.on("data", (chunk) => (err += chunk));
    const code = await new Promise<number | null>((resolve) => child.on("exit", resolve));
    expect(code).toBe(1);
    expect(err).toContain("liars-dice server: PORT must be");
    expect(err).not.toContain("    at ");
  }, 30_000);

  it("logs nothing about who connects", async () => {
    const server = await start({});
    await connect(server.port);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(server.stdout().trim().split("\n")).toHaveLength(1); // only the line that says where it is listening
    expect(server.stdout() + server.stderr()).not.toMatch(/Sam|127\.0\.0\.1:\d+\s+connected/);
  }, 30_000);
});
