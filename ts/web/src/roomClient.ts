import type { ClientMessage, LobbyView, PlayerId, ServerMessage } from "@liars-dice/engine";
import type { Status } from "./connection.ts";
import { RemoteTable } from "./remoteTable.ts";

/**
 * Where a player is, from asking for a room to the end of the game, kept as the server's messages and the connection's
 * status come in. It sends the first request itself, once, when the line first opens; after that the connection
 * resumes by token, so nothing is sent twice. It has no React in it, and `getState` and `subscribe` have the shape
 * `useSyncExternalStore` wants, as `RemoteTable` does. Once a game starts, what happens in it belongs to the
 * `RemoteTable` this makes, and this only passes the messages on.
 */

/** How many lines of lobby news are kept for the screen reader's list. */
export const NEWS_LINES = 20;

export type Phase =
  /** The line is opening. */
  | "connecting"
  /** The request is sent and the server has not answered. */
  | "joining"
  | "lobby"
  | "playing"
  /** The server turned the request down (no such room, it is full, it has started); `error` says why. */
  | "refused"
  /** The ways it can end. */
  | "replaced" // a newer connection took this place
  | "left" // the player left, or this side closed the connection
  | "lost" // the place could not be won back in time
  | "outdated" // the server speaks another protocol version
  | "failed"; // the line broke in a way retrying would not mend

const OVER: ReadonlySet<Phase> = new Set(["refused", "replaced", "left", "lost", "outdated", "failed"]);

export interface RoomState {
  readonly phase: Phase;
  /** The line dropped and is being won back. The phase stays what it was; the screen can say so. */
  readonly reconnecting: boolean;
  /** The room's code, once the server has given it. */
  readonly code: string | null;
  /** This player's id in the lobby. */
  readonly you: PlayerId | null;
  readonly lobby: LobbyView | null;
  /** Whether this player is the host: the one who may start the game. */
  readonly host: boolean;
  /** Who came and went, oldest first, for a polite live region. */
  readonly news: readonly string[];
  /** The server's last refusal in the lobby, or a failure on this side, until the next message. */
  readonly error: string | null;
  /** The running game, once there is one. */
  readonly table: RemoteTable | null;
}

type Started = Extract<ServerMessage, { type: "started" }>;

/** Who is in the lobby now compared with before, as lines of news. */
function newsFor(before: LobbyView, after: LobbyView): string[] {
  const was = new Set(before.players.map((p) => p.id));
  const is = new Set(after.players.map((p) => p.id));
  return [
    ...after.players.filter((p) => !was.has(p.id)).map((p) => `${p.name} joined`),
    ...before.players.filter((p) => !is.has(p.id)).map((p) => `${p.name} left`),
    ...(after.host !== before.host
      ? [`${after.players.find((p) => p.id === after.host)?.name ?? "Someone"} is now the host`]
      : []),
  ];
}

export class RoomClient {
  private state: RoomState = {
    phase: "connecting",
    reconnecting: false,
    code: null,
    you: null,
    lobby: null,
    host: false,
    news: [],
    error: null,
    table: null,
  };
  private requested = false;
  private readonly listeners = new Set<() => void>();

  /** `request` is the create or join message to send when the line first opens. */
  constructor(
    private readonly send: (message: ClientMessage) => boolean,
    private readonly request: ClientMessage,
  ) {}

  getState = (): RoomState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The connection's status changed. */
  setStatus(status: Status): void {
    if (OVER.has(this.state.phase)) return;
    switch (status) {
      case "open":
        if (!this.requested) {
          this.requested = true;
          this.update({ phase: "joining" });
          if (!this.send(this.request)) this.update({ phase: "failed", error: "Not connected." });
        } else if (this.state.reconnecting) {
          this.update({ reconnecting: false });
        }
        return;
      case "reconnecting":
        this.update({ reconnecting: true });
        return;
      case "closed":
        this.update({ phase: "left", reconnecting: false });
        return;
      case "replaced":
      case "left":
      case "lost":
      case "outdated":
      case "failed":
        this.update({ phase: status, reconnecting: false });
        return;
      case "connecting":
        return;
    }
  }

  /** The server sent a message. */
  receive(message: ServerMessage): void {
    if (OVER.has(this.state.phase)) return;
    switch (message.type) {
      case "joined": {
        if (this.state.table !== null) {
          this.state.table.receive(message);
          this.update({ reconnecting: false, error: null });
        } else if (message.view !== undefined && message.kinds !== undefined) {
          // Resuming into a game that has started, with nothing in this tab from before.
          const first: Started = { v: message.v, type: "started", view: message.view, kinds: message.kinds, events: [] };
          this.update({
            phase: "playing",
            code: message.code,
            you: message.you,
            lobby: message.lobby,
            host: false,
            table: new RemoteTable(first),
            error: null,
            reconnecting: false,
          });
        } else {
          this.update({
            phase: "lobby",
            code: message.code,
            you: message.you,
            lobby: message.lobby,
            host: message.lobby.host === message.you,
            error: null,
            reconnecting: false,
          });
        }
        return;
      }
      case "lobby": {
        if (this.state.phase !== "lobby" || this.state.lobby === null) return;
        const news = newsFor(this.state.lobby, message.lobby);
        this.update({
          lobby: message.lobby,
          host: message.lobby.host === this.state.you,
          news: [...this.state.news, ...news].slice(-NEWS_LINES),
          error: null,
        });
        return;
      }
      case "started":
        this.update({ phase: "playing", table: new RemoteTable(message), host: false, error: null });
        return;
      case "state":
        this.state.table?.receive(message);
        return;
      case "error":
        if (this.state.table !== null) this.state.table.receive(message);
        else if (this.state.phase === "connecting" || this.state.phase === "joining") {
          this.update({ phase: "refused", error: message.error });
        } else this.update({ error: message.error });
        return;
      case "replaced":
        this.update({ phase: "replaced", reconnecting: false });
        return;
      case "left":
        this.update({ phase: "left", reconnecting: false });
        return;
    }
  }

  /** The host presses Start. The server says whether they may. */
  start(): void {
    this.command({ type: "start" });
  }

  /** The player gives up their place. */
  leave(): void {
    if (!this.send({ type: "leave" })) this.update({ phase: "left" });
  }

  private command(message: ClientMessage): void {
    this.update({ error: null });
    if (!this.send(message)) this.update({ error: "Not connected. Try again in a moment." });
  }

  private update(patch: Partial<RoomState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}
