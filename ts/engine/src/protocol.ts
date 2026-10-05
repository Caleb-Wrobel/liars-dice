/**
 * The shape of what crosses the wire between a browser and the game server: types and one constant, no behaviour, so the
 * server that sends and checks these messages and the client that reads them share one definition. The server owns
 * checking what a client sends (it is untrusted) and building what it sends back. See docs/multiplayer.md ("Protocol").
 */
import type { GameEvent } from "./core.ts";
import type { SeatView } from "./view.ts";

/** Bumped when the messages change in a way an old client could not follow. */
export const PROTOCOL_VERSION = 1;

/** Who is in a room, as far as the lobby is concerned. Not a seat: seats are dealt when the game starts. */
export type PlayerId = number;

export interface LobbyPlayer {
  readonly id: PlayerId;
  readonly name: string;
}

/** What everyone in a lobby is shown. */
export interface LobbyView {
  readonly code: string;
  /** How many seats the host chose, humans and bots together. */
  readonly capacity: number;
  /** Whoever has been here longest. The host passes to the next person if they leave. */
  readonly host: PlayerId;
  /** In the order they joined. */
  readonly players: readonly LobbyPlayer[];
  /** How many seats a bot will fill if the game started now. */
  readonly bots: number;
  /** Lives each player starts with. */
  readonly lives: number;
  /** Advanced rules rather than basic. */
  readonly advanced: boolean;
}

/** Who holds a seat in a game. A seat a person gave up shows as a bot from then on. */
export type SeatKind = "human" | "bot";

/**
 * What the table is told about absence, beside the game's own events: a seat's player dropped, came back, or was
 * replaced by a bot (they left, or the window ran out). Public, like every event.
 */
export type PresenceEvent = { readonly type: "dropped" | "back" | "botTook"; readonly seat: number };
export type RoomEvent = GameEvent | PresenceEvent;

export type ClientMessage =
  | {
      readonly type: "create";
      readonly name: string;
      readonly seats: number;
      /** Lives each player starts with; the room logic decides what is acceptable. */
      readonly lives?: number;
      /** Advanced rules rather than basic. */
      readonly advanced?: boolean;
    }
  | { readonly type: "join"; readonly code: string; readonly name: string }
  | { readonly type: "resume"; readonly token: string }
  | { readonly type: "start" }
  /** The intent is passed on untouched: the engine's core checks its shape and its legality. */
  | { readonly type: "intent"; readonly intent: unknown }
  | { readonly type: "leave" };

/** What a seat is told when the game starts and each time it moves on. */
interface SeatUpdate {
  readonly view: SeatView;
  /** Who holds each seat now, in seat order. It changes when a bot takes a seat. */
  readonly kinds: readonly SeatKind[];
  readonly events: readonly RoomEvent[];
}

/**
 * What the server sends. Every message carries the protocol version. Each player is sent only their own view: the
 * state of the game as one seat may see it, never the whole game.
 */
export type ServerMessage =
  | {
      readonly v: typeof PROTOCOL_VERSION;
      readonly type: "joined";
      readonly code: string;
      /** The secret that proves this browser owns its place; the client keeps it to resume after a drop. */
      readonly token: string;
      /** This player's id in the lobby, to tell which entry is theirs and whether they are the host. */
      readonly you: PlayerId;
      readonly lobby: LobbyView;
      /** Only when resuming into a game that has started: this seat's view of it, as it stands, and who holds each seat. */
      readonly view?: SeatView;
      readonly kinds?: readonly SeatKind[];
    }
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: "lobby"; readonly lobby: LobbyView }
  | ({ readonly v: typeof PROTOCOL_VERSION; readonly type: "started" } & SeatUpdate)
  | ({ readonly v: typeof PROTOCOL_VERSION; readonly type: "state" } & SeatUpdate)
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: "left" }
  /** To an older connection when a newer one resumes the same place. The socket layer closes it after sending this. */
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: "replaced" }
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: "error"; readonly code: string; readonly error: string };

/** Distributes the version tag, so a message is written once without it. */
export type ServerBody = ServerMessage extends infer M ? (M extends ServerMessage ? Omit<M, "v"> : never) : never;
