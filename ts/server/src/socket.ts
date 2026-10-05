import type { AddressInfo } from "node:net";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import type { Hub } from "./hub.ts";
import { originAllowed } from "./origin.ts";
import { TokenBucket } from "./ratelimit.ts";

/** Far past the largest real message (a few hundred bytes), and nothing like the 100 MiB `ws` allows by default. */
export const MAX_MESSAGE_BYTES = 4096;

/** A person sends a message every few seconds; this lets through twenty at once and then five a second. */
export const RATE_BURST = 20;
export const RATE_PER_SECOND = 5;

/** How often each connection is pinged. A dead one is noticed within one to two of these. */
export const HEARTBEAT_MS = 20_000;

export interface SocketOptions {
  /** 0 asks the system for a free port; the answer is `port` on the result. */
  readonly port: number;
  readonly host?: string;
  /** The URL path that speaks the game's protocol. */
  readonly path?: string;
  /** The biggest message accepted; a bigger one closes the connection (1009) before it has all arrived. */
  readonly maxMessageBytes?: number;
  /** How many messages a connection may send at once, and how many a second it earns back; past that it is closed (1008). */
  readonly rateBurst?: number;
  readonly ratePerSecond?: number;
  /**
   * Websites whose pages may connect, written as a browser writes an origin ("https://example.org", no slash). The
   * deployment supplies them. Left empty, every browser is refused; connections with no `Origin` are not browsers and
   * get in either way.
   */
  readonly allowedOrigins?: readonly string[];
  /** How often to check that each connection still answers (a ping it must pong before the next); the rest are cut. */
  readonly heartbeatMs?: number;
  /** The time in milliseconds, for the rate limit. Tests wind their own. */
  readonly now?: () => number;
}

export interface SocketServer {
  readonly port: number;
  /** Closes every connection (the hub is told each one has gone) and stops listening. */
  close(): Promise<void>;
}

/** WebSocket close codes: the standard ones, named for why we use them. */
const CLOSE = { normal: 1000, unsupported: 1003, policy: 1008, invalid: 1007, failure: 1011 } as const;

/**
 * The network around the hub, and nothing more. Each WebSocket becomes a hub connection: its text frames are parsed as
 * JSON and handed over, what the hub sends is written back as JSON, and a closed socket is reported as a disconnect.
 * Which messages are acceptable and who sees what is the hub's business; this file only moves bytes. A connection that
 * sends something that is not JSON text is closed, and so is the older one when the hub says it was `replaced`. Messages
 * over a few kilobytes close the connection, sending too many too fast does too, and so does a connection that stops answering pings. A browser from a website that is not on the list is refused at the door. See docs/multiplayer.md.
 */
export function listen(hub: Hub, options: SocketOptions): Promise<SocketServer> {
  const wss = new WebSocketServer({
    port: options.port,
    path: options.path ?? "/ws",
    maxPayload: options.maxMessageBytes ?? MAX_MESSAGE_BYTES,
    // Refused during the handshake, so the hub never hears of the connection.
    verifyClient: ({ origin }, done) => done(originAllowed(origin, options.allowedOrigins ?? []), 403, "origin not allowed"),
    ...(options.host === undefined ? {} : { host: options.host }),
  });
  // A connection that dies without saying so (a lost signal, a closed lid) is never seen to close. Each round every
  // connection must have answered the last ping, or it is cut, which tells the hub and starts the absence window.
  const answered = new WeakSet<WebSocket>();
  wss.on("connection", (ws) => {
    answered.add(ws);
    ws.on("pong", () => answered.add(ws));
    bind(hub, ws, options);
  });
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!answered.delete(ws)) ws.terminate();
      else ws.ping();
    }
  }, options.heartbeatMs ?? HEARTBEAT_MS);
  return new Promise((resolve, reject) => {
    wss.once("error", reject);
    wss.once("listening", () => {
      resolve({
        port: (wss.address() as AddressInfo).port,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(beat);
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}

function bind(hub: Hub, ws: WebSocket, options: SocketOptions): void {
  const bucket = new TokenBucket(options.rateBurst ?? RATE_BURST, options.ratePerSecond ?? RATE_PER_SECOND, options.now ?? Date.now);
  const conn = hub.connect((message) => {
    ws.send(JSON.stringify(message));
    if (message.type === "replaced") ws.close(CLOSE.normal, "replaced");
  });
  ws.on("message", (data: RawData, isBinary: boolean) => {
    // Every message counts, good or bad, before any work is done on it.
    if (!bucket.take()) return ws.close(CLOSE.policy, "too many messages");
    if (isBinary) return ws.close(CLOSE.unsupported, "text only");
    let raw: unknown;
    try {
      raw = JSON.parse(data.toString());
    } catch {
      return ws.close(CLOSE.invalid, "not JSON");
    }
    try {
      hub.receive(conn, raw);
    } catch {
      // A bug in the hub must cost one connection, not the whole server.
      ws.close(CLOSE.failure, "server error");
    }
  });
  // A broken frame raises "error" and then "close"; the close is where the hub is told.
  ws.on("error", () => {});
  ws.on("close", () => hub.disconnect(conn));
}
