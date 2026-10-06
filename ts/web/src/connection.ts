import { PROTOCOL_VERSION, type ClientMessage, type Rng, type ServerMessage } from "@liars-dice/engine";

/**
 * One WebSocket to the game server, as the rest of the client sees it: typed messages in and out, a status, and the
 * place-keeping token. It knows nothing about games or React. When the line drops it reconnects on its own and resumes
 * the player's place with the token, which is why the server holds a seat for a while after a drop.
 */

export type Status =
  /** Opening the first connection, or one that carries a token and is about to resume. */
  | "connecting"
  | "open"
  /** The line dropped. Retrying, and not yet told by the server that the place is ours again. */
  | "reconnecting"
  /** Final states: nothing more will happen on this connection. */
  | "replaced" // a newer connection took this place
  | "left" // the player left on purpose
  | "closed" // this side closed it
  | "lost" // the place could not be won back in time
  | "outdated" // the server speaks another protocol version
  | "failed"; // the line broke in a way retrying would not mend

/** The part of a WebSocket this class uses, so a test can stand in for the real thing. */
export interface SocketLike {
  onopen: ((event: Event) => unknown) | null;
  onmessage: ((event: MessageEvent) => unknown) | null;
  onclose: ((event: CloseEvent) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  send(data: string): void;
  close(code?: number): void;
}

/** First wait before a retry; it doubles each time up to `RETRY_MAX_MS`. */
export const RETRY_FIRST_MS = 500;
export const RETRY_MAX_MS = 5_000;
/**
 * How long to keep trying after a drop. The server holds a place for 60 s and a bot takes it after that, so retrying
 * much past this is pointless: the margin covers a slow last attempt.
 */
export const GIVE_UP_MS = 75_000;

/**
 * Close codes that say the server refused what this client sent (unsupported data, not text, rate limit, too big).
 * Reconnecting would just repeat the offence, so these end the connection.
 */
const REFUSED = new Set([1003, 1007, 1008, 1009]);

const FINAL: ReadonlySet<Status> = new Set(["replaced", "left", "closed", "lost", "outdated", "failed"]);

export interface ConnectionOptions {
  url: string;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: Status) => void;
  /** A token kept from earlier, to resume a place as soon as the line opens. */
  token?: string;
  /** Defaults to a real WebSocket. */
  open?: (url: string) => SocketLike;
  /** Spreads retries out so many clients that dropped together do not all return together. */
  rng?: Rng;
}

export class Connection {
  private readonly options: ConnectionOptions;
  private socket: SocketLike | null = null;
  private current: Status = "connecting";
  private saved: string | undefined;
  /** True from the moment a resume is sent until the server answers it. */
  private resuming = false;
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private giveUpTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ConnectionOptions) {
    this.options = options;
    this.saved = options.token;
    this.connect();
  }

  get status(): Status {
    return this.current;
  }

  /** The secret that proves this place is ours; set once the server has said `joined`. */
  get token(): string | undefined {
    return this.saved;
  }

  /**
   * Sends a message if the line is open and the place is ours, and says whether it did. A message is never held back
   * for later: what a player meant a moment ago may no longer be legal when the line returns.
   */
  send(message: ClientMessage): boolean {
    if (this.current !== "open" || this.socket === null) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  /** Closes the connection for good. */
  close(): void {
    this.finish("closed");
  }

  private set(status: Status): void {
    if (status === this.current) return;
    this.current = status;
    this.options.onStatus(status);
  }

  /** Ends the connection with a final status and closes whatever socket is left. */
  private finish(status: Status): void {
    if (FINAL.has(this.current)) return;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null; // before the close, so its close event is taken for a stale one
    this.set(status);
    socket?.close(1000);
  }

  private clearTimers(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    if (this.giveUpTimer !== null) clearTimeout(this.giveUpTimer);
    this.retryTimer = null;
    this.giveUpTimer = null;
  }

  private connect(): void {
    const socket = (this.options.open ?? ((url) => new WebSocket(url)))(this.options.url);
    this.socket = socket;
    // A handler of an older socket may still fire after a retry has replaced it; only the current one counts.
    socket.onopen = () => socket === this.socket && this.opened(socket);
    socket.onmessage = (event) => socket === this.socket && this.received(event.data);
    socket.onclose = (event) => socket === this.socket && this.closed(event.code);
    socket.onerror = () => {}; // a close follows every error, and that is what we act on
  }

  private opened(socket: SocketLike): void {
    if (this.saved === undefined) return this.set("open"); // a first visit: the owner sends create or join
    this.resuming = true;
    socket.send(JSON.stringify({ type: "resume", token: this.saved } satisfies ClientMessage));
  }

  private received(data: unknown): void {
    const message = parse(data);
    if (message === "garbled") return this.finish("failed");
    if (message === "outdated") return this.finish("outdated");
    const wasResuming = this.resuming;
    if (message.type === "joined") {
      this.saved = message.token;
      this.resuming = false;
      this.attempts = 0;
      this.clearTimers();
      this.set("open");
    } else if (message.type === "error" && wasResuming) {
      // The server does not know that token any more, or the room is gone: the place cannot be won back.
      this.options.onMessage(message);
      return this.finish("lost");
    } else if (message.type === "replaced") {
      this.options.onMessage(message);
      return this.finish("replaced");
    } else if (message.type === "left") {
      this.options.onMessage(message);
      return this.finish("left");
    }
    this.options.onMessage(message);
  }

  private closed(code: number): void {
    this.socket = null;
    // Without a token there is no place to resume, so a line that dropped before joining is only a failure.
    if (REFUSED.has(code) || this.saved === undefined) return this.finish("failed");
    this.set("reconnecting");
    this.giveUpTimer ??= setTimeout(() => this.finish("lost"), GIVE_UP_MS);
    const wait = Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** this.attempts++);
    this.retryTimer = setTimeout(() => this.connect(), wait * (0.5 + 0.5 * (this.options.rng ?? Math.random)()));
  }
}

/** What arrived, as a server message; or why not. The server is ours, so only the envelope is checked. */
function parse(data: unknown): ServerMessage | "garbled" | "outdated" {
  if (typeof data !== "string") return "garbled";
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return "garbled";
  }
  if (typeof value !== "object" || value === null || typeof (value as { type?: unknown }).type !== "string") return "garbled";
  return (value as { v?: unknown }).v === PROTOCOL_VERSION ? (value as ServerMessage) : "outdated";
}
