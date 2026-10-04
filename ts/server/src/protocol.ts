/**
 * The messages a client may send. Everything arriving from the network is untrusted, so this turns raw JSON into a
 * typed message or a reason it was refused, and checks shapes and sizes only. Whether a name is acceptable, a room
 * exists or a move is legal is decided later, by the room logic and the engine. See docs/multiplayer.md ("Protocol").
 */

/** Bumped when the messages change in a way an old client could not follow. */
export const PROTOCOL_VERSION = 1;

export type ClientMessage =
  | { readonly type: "create"; readonly name: string; readonly seats: number }
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
    case "create":
      return text(msg.name) && typeof msg.seats === "number" && Number.isInteger(msg.seats)
        ? { ok: true, message: { type: "create", name: msg.name, seats: msg.seats } }
        : refuse("malformed", "create needs a name and a number of seats");
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
