import { nextRank, seededRng, type SeatView } from "@liars-dice/engine";
import { Hub, type ConnId } from "../src/hub.ts";
import { PROTOCOL_VERSION, type ServerMessage } from "../src/protocol.ts";
import { FakeClock } from "./clock.ts";

/** A pretend browser: everything the server sends it is kept, in order. */
export class TestClient {
  readonly messages: ServerMessage[] = [];
  readonly conn: ConnId;
  private latest: SeatView | undefined;
  private secret = "";

  constructor(private readonly hub: Hub) {
    this.conn = hub.connect((m) => {
      this.messages.push(m);
      if (m.type === "joined") this.secret = m.token;
      if (m.type === "started" || m.type === "state" || (m.type === "joined" && m.view !== undefined)) this.latest = m.view;
    });
  }

  send(message: Record<string, unknown>): void {
    this.hub.receive(this.conn, { v: PROTOCOL_VERSION, ...message });
  }

  raw(message: unknown): void {
    this.hub.receive(this.conn, message);
  }

  disconnect(): void {
    this.hub.disconnect(this.conn);
  }

  get last(): ServerMessage | undefined {
    return this.messages.at(-1);
  }

  /** Every message of a type, in order. */
  all<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  }

  /** Forgets what has been received so far, to look only at what comes next. */
  clear(): void {
    this.messages.length = 0;
  }

  /** The latest view of the game this client has been sent, if it has been; `clear` does not forget it. */
  get view(): SeatView | undefined {
    return this.latest;
  }

  /** The latest token this client was given; `clear` does not forget it. */
  get token(): string {
    return this.secret;
  }
}

export function newHub(seed = 1, extra: { maxRooms?: number } = {}) {
  const clock = new FakeClock();
  const hub = new Hub({ rng: seededRng(seed), clock, ...extra });
  return { hub, clock, client: () => new TestClient(hub) };
}

/** A room with a host and the given others in the lobby, not yet started. */
export function lobbyOf(names: string[], seats: number, rules: Record<string, unknown> = {}, seed = 1) {
  const t = newHub(seed);
  const clients = names.map(() => t.client());
  clients[0]!.send({ type: "create", name: names[0], seats, ...rules });
  const code = clients[0]!.all("joined")[0]!.code;
  names.slice(1).forEach((name, i) => clients[i + 1]!.send({ type: "join", code, name }));
  return { ...t, clients, code };
}

/** If it is this client's turn, plays one move chosen by what its view offers. Returns whether it moved. */
export function playIfOnTurn(client: TestClient): boolean {
  const v = client.view;
  if (v === undefined || v.available.length === 0) return false;
  const [action] = (["pull", "roll", "peek", "claim"] as const).filter((a) => v.available.includes(a));
  client.send({ type: "intent", intent: action === "claim" ? { action, rank: nextRank(v.claim)! } : { action } });
  return true;
}

/** Runs a game to its end: humans move on their turn by their views, the clock runs the bots. */
export function playToEnd(clients: TestClient[], clock: FakeClock): void {
  for (let i = 0; i < 6000; i++) {
    if (clients[0]!.view?.winner != null) return;
    if (!clients.some((c) => playIfOnTurn(c))) clock.advance(10_000);
  }
  throw new Error("the game did not finish");
}
