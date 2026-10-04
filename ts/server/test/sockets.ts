import { nextRank, seededRng, type SeatView } from "@liars-dice/engine";
import { WebSocket } from "ws";
import { Hub } from "../src/hub.ts";
import { PROTOCOL_VERSION, type ServerMessage } from "../src/protocol.ts";
import { listen, type SocketServer } from "../src/socket.ts";
import { FakeClock } from "./clock.ts";

/** A hub on a real socket (a free port on this machine) with a clock the test winds by hand. */
export async function liveServer(seed = 1, hub?: Hub) {
  const clock = new FakeClock();
  const theHub = hub ?? new Hub({ rng: seededRng(seed), clock });
  const server: SocketServer = await listen(theHub, { port: 0, host: "127.0.0.1" });
  return {
    hub: theHub,
    clock,
    server,
    url: `ws://127.0.0.1:${server.port}/ws`,
    client: (): Promise<LiveClient> => LiveClient.open(`ws://127.0.0.1:${server.port}/ws`),
    async stop() {
      await server.close();
    },
  };
}

/** A real browser stand-in: a WebSocket that keeps everything the server sends, in order. */
export class LiveClient {
  readonly messages: ServerMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  private latest: SeatView | undefined;
  private secret = "";
  private waiting: (() => void)[] = [];

  private constructor(readonly ws: WebSocket) {
    ws.on("message", (data) => {
      const m = JSON.parse(data.toString()) as ServerMessage;
      this.messages.push(m);
      if (m.type === "joined") this.secret = m.token;
      if (m.type === "started" || m.type === "state" || (m.type === "joined" && m.view !== undefined)) this.latest = m.view;
      this.wake();
    });
    ws.on("close", (code, reason) => {
      this.closed = { code, reason: reason.toString() };
      this.wake();
    });
  }

  static open(url: string): Promise<LiveClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.once("open", () => resolve(new LiveClient(ws)));
      ws.once("error", reject);
    });
  }

  send(message: Record<string, unknown>): void {
    this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...message }));
  }

  get view(): SeatView | undefined {
    return this.latest;
  }

  get token(): string {
    return this.secret;
  }

  all<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  }

  private wake(): void {
    const waiting = this.waiting;
    this.waiting = [];
    for (const w of waiting) w();
  }

  /** Resolves when `ready` holds, checking again at each message or close; fails rather than hang the suite. */
  async until(ready: () => boolean, what = "something to happen"): Promise<void> {
    const deadline = Date.now() + 3000;
    while (!ready()) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }

  /**
   * A barrier. The server answers a bad request with an error straight away and keeps one socket's messages in order,
   * so once that error arrives everything it sent before has arrived too.
   */
  async sync(): Promise<void> {
    const errors = this.all("error").length;
    this.send({ type: "create", name: "", seats: 0 });
    await this.until(() => this.all("error").length > errors, "a reply");
  }

  async close(): Promise<void> {
    if (this.closed !== null) return;
    this.ws.close();
    await this.until(() => this.closed !== null, "the socket to close");
  }
}

/** Plays a client's move if the view says it is on turn. Returns whether it sent one. */
export function playIfOnTurn(client: LiveClient): boolean {
  const v = client.view;
  if (v === undefined || v.available.length === 0) return false;
  const [action] = (["pull", "roll", "peek", "claim"] as const).filter((a) => v.available.includes(a));
  client.send({ type: "intent", intent: action === "claim" ? { action, rank: nextRank(v.claim)! } : { action } });
  return true;
}

/** Runs a game over real sockets to its end: humans move by their views, the fake clock runs the bots. */
export async function playToEnd(clients: LiveClient[], clock: FakeClock): Promise<void> {
  for (let i = 0; i < 6000; i++) {
    if (clients[0]!.view?.winner != null) return;
    const moved = clients.filter((c) => playIfOnTurn(c));
    if (moved.length === 0) clock.advance(10_000);
    for (const c of clients) await c.sync();
  }
  throw new Error("the game did not finish");
}
