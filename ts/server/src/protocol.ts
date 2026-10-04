/**
 * The messages that cross the wire. What a client may send is untrusted, so this turns raw JSON into a typed message or
 * a reason it was refused, and checks shapes and sizes only; whether a name is acceptable, a room exists or a move is
 * legal is decided later, by the room logic and the engine. And what the server sends back. See docs/multiplayer.md
 * ("Protocol").
 */
import type { GameEvent, SeatView } from "@liars-dice/engine";
import type { LobbyView } from "./rooms.ts";

/**
 * What the table is told about absence, beside the game's own events: a seat's player dropped, came back, or was
 * replaced by a bot (they left, or the window ran out). Public, like every event.
 */
export type PresenceEvent = { readonly type: "dropped" | "back" | "botTook"; readonly seat: number };
export type RoomEvent = GameEvent | PresenceEvent;

/** Bumped when the messages change in a way an old client could not follow. */
export const PROTOCOL_VERSION = 1;

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

export type ParsedMessage =
  | { readonly ok: true; readonly message: ClientMessage }
  | { readonly ok: false; readonly code: "version" | "malformed"; readonly error: string };

/** Generous bounds, well past anything a real client sends; the point is that nothing huge gets through. */
const MAX_TEXT = 256;

const refuse = (code: "version" | "malformed", error: string): ParsedMessage => ({ ok: false, code, error });
const text = (x: unknown): x is string => typeof x === "string" && x.length <= MAX_TEXT;

export function parseClientMessage(raw: unknown): ParsedMessage {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return refuse("malformed", "that is not a message");
  const msg = raw as Record<string, unknown>;
  if (msg.v !== PROTOCOL_VERSION) return refuse("version", "this server speaks a different version; reload the page");
  switch (msg.type) {
    case "create": {
      const { lives, advanced } = msg;
      const optionsOk =
        (lives === undefined || (typeof lives === "number" && Number.isInteger(lives))) &&
        (advanced === undefined || typeof advanced === "boolean");
      if (!text(msg.name) || typeof msg.seats !== "number" || !Number.isInteger(msg.seats) || !optionsOk) {
        return refuse("malformed", "create needs a name, a number of seats and, if given, lives and rules");
      }
      return {
        ok: true,
        message: {
          type: "create",
          name: msg.name,
          seats: msg.seats,
          ...(lives === undefined ? {} : { lives: lives as number }),
          ...(advanced === undefined ? {} : { advanced: advanced as boolean }),
        },
      };
    }
    case "join":
      return text(msg.code) && text(msg.name)
        ? { ok: true, message: { type: "join", code: msg.code, name: msg.name } }
        : refuse("malformed", "join needs a room code and a name");
    case "resume":
      return text(msg.token)
        ? { ok: true, message: { type: "resume", token: msg.token } }
        : refuse("malformed", "resume needs a token");
    case "start":
      return { ok: true, message: { type: "start" } };
    case "intent":
      return "intent" in msg ? { ok: true, message: { type: "intent", intent: msg.intent } } : refuse("malformed", "intent needs a move");
    case "leave":
      return { ok: true, message: { type: "leave" } };
    default:
      return refuse("malformed", "unknown message type");
  }
}

/**
 * What the server sends. Every message carries the protocol version. Each player is sent only their own view: the
 * state of the game as one seat may see it, never the whole game. See docs/multiplayer.md.
 */
export type ServerMessage =
  | {
      readonly v: typeof PROTOCOL_VERSION;
      readonly type: "joined";
      readonly code: string;
      /** The secret that proves this browser owns its place; the client keeps it to resume after a drop. */
      readonly token: string;
      /** This player's id in the lobby, to tell which entry is theirs and whether they are the host. */
      readonly you: number;
      readonly lobby: LobbyView;
      /** Only when resuming into a game that has started: this seat's view of it, as it stands. */
      readonly view?: SeatView;
    }
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: "lobby"; readonly lobby: LobbyView }
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: "started"; readonly view: SeatView; readonly events: readonly RoomEvent[] }
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: "state"; readonly view: SeatView; readonly events: readonly RoomEvent[] }
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: "left" }
  /** To an older connection when a newer one resumes the same place. The socket layer closes it after sending this. */
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: "replaced" }
  | { readonly v: typeof PROTOCOL_VERSION; readonly type: "error"; readonly code: string; readonly error: string };

/** Distributes the version tag, so a message is written once without it. */
export type ServerBody = ServerMessage extends infer M ? (M extends ServerMessage ? Omit<M, "v"> : never) : never;
export const serverMessage = (body: ServerBody): ServerMessage => ({ v: PROTOCOL_VERSION, ...body }) as ServerMessage;
