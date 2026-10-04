import type { AddressInfo } from "node:net";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import type { Hub } from "./hub.ts";

export interface SocketOptions {
  /** 0 asks the system for a free port; the answer is `port` on the result. */
  readonly port: number;
  readonly host?: string;
  /** The URL path that speaks the game's protocol. */
  readonly path?: string;
}

export interface SocketServer {
  readonly port: number;
  /** Closes every connection (the hub is told each one has gone) and stops listening. */
  close(): Promise<void>;
}

/** WebSocket close codes: the standard ones, named for why we use them. */
const CLOSE = { normal: 1000, unsupported: 1003, invalid: 1007, failure: 1011 } as const;

/**
 * The network around the hub, and nothing more. Each WebSocket becomes a hub connection: its text frames are parsed as
 * JSON and handed over, what the hub sends is written back as JSON, and a closed socket is reported as a disconnect.
 * Which messages are acceptable and who sees what is the hub's business; this file only moves bytes. A connection that
 * sends something that is not JSON text is closed, and so is the older one when the hub says it was `replaced`. Limits,
 * heartbeats and the origin check come next, in their own piece. See docs/multiplayer.md.
 */
export function listen(hub: Hub, options: SocketOptions): Promise<SocketServer> {
  const wss = new WebSocketServer({ port: options.port, path: options.path ?? "/ws", ...(options.host === undefined ? {} : { host: options.host }) });
  wss.on("connection", (ws) => bind(hub, ws));
  return new Promise((resolve, reject) => {
    wss.once("error", reject);
    wss.once("listening", () => {
      resolve({
        port: (wss.address() as AddressInfo).port,
        close: () =>
          new Promise<void>((done) => {
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}

function bind(hub: Hub, ws: WebSocket): void {
  const conn = hub.connect((message) => {
    ws.send(JSON.stringify(message));
    if (message.type === "replaced") ws.close(CLOSE.normal, "replaced");
  });
  ws.on("message", (data: RawData, isBinary: boolean) => {
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
