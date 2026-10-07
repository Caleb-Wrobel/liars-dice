import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION, seededRng } from "@liars-dice/engine";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { Hub } from "../src/hub.ts";
import { listen, type SocketServer } from "../src/socket.ts";
import { FakeClock } from "./clock.ts";

const script = fileURLToPath(new URL("../scripts/smoke.mjs", import.meta.url));
/**
 * Runs the script and says how it ended. It must not block: the server under test is in this very process, and a
 * blocked process cannot answer the script that is waiting for it.
 */
const run = (args: string[], env: Record<string, string> = {}) =>
  new Promise<{ status: number; stdout: string; stderr: string }>((resolve) => {
    execFile(process.execPath, [script, ...args], { encoding: "utf8", timeout: 30_000, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      const code = (error as (Error & { code?: unknown }) | null)?.code;
      resolve({ status: error === null ? 0 : typeof code === "number" ? code : 1, stdout, stderr });
    });
  });

const open: { close(): unknown }[] = [];
afterEach(async () => {
  for (const thing of open.splice(0)) await thing.close();
});

async function realServer(): Promise<SocketServer> {
  const server = await listen(new Hub({ rng: seededRng(1), clock: new FakeClock() }), { port: 0, host: "127.0.0.1" });
  open.push(server);
  return server;
}

/** A server that answers every message with `reply`, whatever it was asked. */
async function answering(reply: string): Promise<number> {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1", path: "/ws" });
  await new Promise((resolve) => wss.once("listening", resolve));
  wss.on("connection", (ws) => ws.on("message", () => ws.send(reply)));
  open.push({ close: () => new Promise((resolve) => wss.close(resolve)) });
  return (wss.address() as { port: number }).port;
}

describe("the smoke script", () => {
  it("passes against a real server, and says which room it made", async () => {
    const { port } = await realServer();
    const result = await run([`ws://127.0.0.1:${port}/ws`]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^ok: the server made room [BCDFGHJKLMNPQRSTVWXZ]{4}\n$/);
  });

  it("speaks the protocol version the server speaks", () => {
    expect(readFileSync(script, "utf8")).toContain(`const PROTOCOL_VERSION = ${PROTOCOL_VERSION};`);
  });

  it("fails, and says so, when nothing is listening", async () => {
    const { port } = await realServer();
    await open.pop()!.close(); // the port is now free, and nothing is on it
    const result = await run([`ws://127.0.0.1:${port}/ws`]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^fail: could not reach ws:\/\/127\.0\.0\.1:\d+\/ws\n$/); // the helpful message, not the close's
  });

  it("fails when the server answers with something other than a room", async () => {
    const port = await answering(JSON.stringify({ v: 1, type: "error", code: "version", error: "different version" }));
    const result = await run([`ws://127.0.0.1:${port}/ws`]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unexpected answer");
    expect(result.stderr).toContain("different version");
  });

  it("fails when the answer is not JSON", async () => {
    const port = await answering("not json");
    const result = await run([`ws://127.0.0.1:${port}/ws`]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not JSON");
  });

  it("fails when what it takes for a room code is not one", async () => {
    const port = await answering(JSON.stringify({ v: 1, type: "joined", code: "abcd" }));
    const result = await run([`ws://127.0.0.1:${port}/ws`]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unexpected answer");
  });

  it("fails when the connection closes before the server has answered", async () => {
    const wss = new WebSocketServer({ port: 0, host: "127.0.0.1", path: "/ws" });
    await new Promise((resolve) => wss.once("listening", resolve));
    wss.on("connection", (ws) => ws.on("message", () => ws.close()));
    open.push({ close: () => new Promise((resolve) => wss.close(resolve)) });
    const result = await run([`ws://127.0.0.1:${(wss.address() as { port: number }).port}/ws`]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("closed before the server answered");
  });

  it("gives up, and says so, when the server never answers", async () => {
    const wss = new WebSocketServer({ port: 0, host: "127.0.0.1", path: "/ws" });
    await new Promise((resolve) => wss.once("listening", resolve));
    open.push({ close: () => new Promise((resolve) => wss.close(resolve)) });
    const result = await run([`ws://127.0.0.1:${(wss.address() as { port: number }).port}/ws`], { SMOKE_TIMEOUT_MS: "400" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no answer within 0.4 seconds");
  });

  it("says how to use it, and exits with 2, when it is not told where to look", async () => {
    const result = await run([]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage:");
  });
});
