import type {
  BotPace,
  ClientMessage,
  LobbyView,
  PlayerId,
  Rng,
  RoomEvent,
  ServerBody,
  ServerMessage,
} from "@liars-dice/engine";
import { Match, type Clock, type MatchUpdate } from "./match.ts";
import { parseClientMessage, serverMessage } from "./protocol.ts";
import { newToken } from "./random.ts";
import { RoomRegistry, type Entered } from "./rooms.ts";

export type ConnId = number;
export type Send = (message: ServerMessage) => void;

/** How long a dropped player's place is held before a bot takes it (or, in a lobby, the place is freed). */
export const GRACE_MS = 60_000;

export interface HubOptions {
  /** Codes, tokens, shuffles and dice. The server passes secure randomness; tests pass a seeded one. */
  readonly rng: Rng;
  readonly clock: Clock;
  readonly pace?: BotPace;
  readonly maxRooms?: number;
  /** The window for coming back after a drop. */
  readonly graceMs?: number;
}

/** One person's place in a room, for as long as they are in it. */
interface Member {
  readonly player: PlayerId;
  readonly name: string;
  readonly token: string;
  readonly code: string;
  /** Their connection right now, or null while they are not connected. */
  conn: ConnId | null;
  /** The timer that gives the place up, while they are away. */
  grace: unknown;
}

interface Room {
  readonly code: string;
  /** In the order they joined. */
  readonly members: Member[];
  match: Match | null;
}

interface Conn {
  readonly send: Send;
  member: Member | null;
}

/**
 * The server's brain, with no network in it: it is told when a connection opens, what it says and when it closes, and it
 * answers by calling each connection's `send`. It keeps the rooms (lobbies through the registry, games through
 * matches), hands out the secret tokens that say who owns a place, and makes sure every player is sent only their own
 * view of the game. The WebSocket layer is a thin shell around it. See docs/multiplayer.md.
 */
export class Hub {
  private readonly registry: RoomRegistry;
  private readonly conns = new Map<ConnId, Conn>();
  private readonly rooms = new Map<string, Room>();
  /** Whose place each token opens. */
  private readonly tokens = new Map<string, Member>();
  private nextConn = 1;

  constructor(private readonly options: HubOptions) {
    this.registry = new RoomRegistry({
      rng: options.rng,
      ...(options.maxRooms === undefined ? {} : { maxRooms: options.maxRooms }),
    });
  }

  /** How many rooms exist, lobbies and games together. */
  get roomCount(): number {
    return this.registry.size;
  }

  /** A connection has opened. `send` is how the hub talks to it. */
  connect(send: Send): ConnId {
    const id = this.nextConn++;
    this.conns.set(id, { send, member: null });
    return id;
  }

  /** A connection has closed. */
  disconnect(conn: ConnId): void {
    const c = this.conns.get(conn);
    if (c === undefined) return;
    this.conns.delete(conn);
    const member = c.member;
    if (member === null) return;
    member.conn = null;
    const room = this.rooms.get(member.code)!;
    // Nobody is waiting on a finished game, so there is nothing to hold the place for.
    if (room.match !== null && room.match.winner !== null) return this.depart(room, member);
    const seat = room.match?.seatOf(member.player);
    if (seat !== undefined) this.announce(room, [{ type: "dropped", seat }]);
    member.grace = this.options.clock.setTimeout(() => this.depart(room, member), this.options.graceMs ?? GRACE_MS);
  }

  /** A message arrived, already parsed from JSON but not yet trusted. */
  receive(conn: ConnId, raw: unknown): void {
    const c = this.conns.get(conn);
    if (c === undefined) return;
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return this.tell(c, { type: "error", code: parsed.code, error: parsed.error });
    this.handle(conn, c, parsed.message);
  }

  private handle(conn: ConnId, c: Conn, message: ClientMessage): void {
    switch (message.type) {
      case "create": {
        if (c.member !== null) return this.refuse(c, "in_room", "you are already in a room");
        const rules = {
          ...(message.lives === undefined ? {} : { lives: message.lives }),
          ...(message.advanced === undefined ? {} : { advanced: message.advanced }),
        };
        const res = this.registry.create(message.name, message.seats, rules);
        if (!res.ok) return this.refuse(c, res.code, res.error);
        this.rooms.set(res.code, { code: res.code, members: [], match: null });
        return this.admit(conn, c, res);
      }
      case "join": {
        if (c.member !== null) return this.refuse(c, "in_room", "you are already in a room");
        const res = this.registry.join(message.code, message.name);
        if (!res.ok) return this.refuse(c, res.code, res.error);
        return this.admit(conn, c, res);
      }
      case "start": {
        const member = c.member;
        if (member === null) return this.refuse(c, "no_room", "you are not in a room");
        const res = this.registry.start(member.code, member.player);
        if (!res.ok) return this.refuse(c, res.code, res.error);
        const room = this.rooms.get(member.code)!;
        room.match = new Match(res.setup, {
          rng: this.options.rng,
          clock: this.options.clock,
          ...(this.options.pace === undefined ? {} : { pace: this.options.pace }),
          onUpdate: (update) => this.deliver(room, "state", update),
        });
        return this.deliver(room, "started", room.match.initial);
      }
      case "intent": {
        const member = c.member;
        if (member === null) return this.refuse(c, "no_room", "you are not in a room");
        const match = this.rooms.get(member.code)?.match;
        if (match === null || match === undefined) return this.refuse(c, "not_started", "the game has not started");
        const res = match.submit(member.player, message.intent);
        if (!res.ok) this.refuse(c, "illegal", res.error);
        return;
      }
      case "leave": {
        const member = c.member;
        if (member === null) return this.refuse(c, "no_room", "you are not in a room");
        this.tell(c, { type: "left" });
        return this.depart(this.rooms.get(member.code)!, member);
      }
      case "resume": {
        if (c.member !== null) return this.refuse(c, "in_room", "you are already in a room");
        const member = this.tokens.get(message.token);
        if (member === undefined) return this.refuse(c, "unknown_token", "that place is no longer yours");
        const room = this.rooms.get(member.code)!;
        // The newest connection wins; the older one is told, and the socket layer closes it.
        const older = member.conn === null ? undefined : this.conns.get(member.conn);
        if (older !== undefined) {
          older.member = null;
          this.tell(older, { type: "replaced" });
        }
        if (member.grace !== null) this.options.clock.clearTimeout(member.grace);
        member.grace = null;
        member.conn = conn;
        c.member = member;
        const view = room.match?.view(member.player);
        this.tell(c, {
          type: "joined",
          code: room.code,
          token: member.token,
          you: member.player,
          lobby: this.registry.lobby(room.code)!,
          ...(view === undefined ? {} : { view, kinds: room.match!.kinds }),
        });
        const seat = room.match?.seatOf(member.player);
        if (seat !== undefined) this.announce(room, [{ type: "back", seat }], member);
        return;
      }
    }
  }

  /**
   * A person's place is given up, by their own choice or because their window ran out. In a lobby the seat is freed and
   * the host passes on; in a game a fresh bot takes the seat at once. The room closes when no person is left in it.
   */
  private depart(room: Room, member: Member): void {
    if (member.grace !== null) this.options.clock.clearTimeout(member.grace);
    member.grace = null;
    this.tokens.delete(member.token);
    room.members.splice(room.members.indexOf(member), 1);
    const c = member.conn === null ? undefined : this.conns.get(member.conn);
    if (c !== undefined) c.member = null;
    member.conn = null;
    if (room.match === null) {
      this.registry.leave(room.code, member.player);
    } else {
      const seat = room.match.takeOver(member.player);
      if (seat !== undefined) this.announce(room, [{ type: "botTook", seat }]);
    }
    if (room.members.length === 0) {
      room.match?.stop();
      this.registry.close(room.code);
      this.rooms.delete(room.code);
    } else if (room.match === null) {
      this.broadcastLobby(room);
    }
  }

  /** Tells every connected player something that is not a move, with their own view as it now stands. */
  private announce(room: Room, events: readonly RoomEvent[], except?: Member): void {
    const match = room.match;
    if (match === null) return;
    for (const m of room.members) {
      const view = match.view(m.player);
      if (m !== except && view !== undefined) this.toMember(m, { type: "state", view, kinds: match.kinds, events });
    }
  }

  /** Puts a connection into the room it just created or joined. */
  private admit(conn: ConnId, c: Conn, res: Entered): void {
    const room = this.rooms.get(res.code)!;
    const name = res.lobby.players.find((p) => p.id === res.player)!.name;
    const member: Member = { player: res.player, name, token: newToken(this.options.rng), code: res.code, conn, grace: null };
    room.members.push(member);
    this.tokens.set(member.token, member);
    c.member = member;
    this.tell(c, { type: "joined", code: res.code, token: member.token, you: member.player, lobby: res.lobby });
    this.broadcastLobby(room, member);
  }

  /** Tells everyone in a lobby how it now looks, except the one who has just been told something more. */
  private broadcastLobby(room: Room, except?: Member): void {
    const lobby: LobbyView | undefined = this.registry.lobby(room.code);
    if (lobby === undefined) return;
    for (const m of room.members) if (m !== except) this.toMember(m, { type: "lobby", lobby });
  }

  /** Sends every connected player their own view of an update: nobody is ever sent another seat's. */
  private deliver(room: Room, type: "started" | "state", update: MatchUpdate): void {
    const match = room.match!;
    for (const m of room.members) {
      const seat = match.seatOf(m.player);
      if (seat === undefined) continue;
      this.toMember(m, { type, view: update.views[seat]!, kinds: update.kinds, events: update.events });
    }
  }

  private toMember(member: Member, body: ServerBody): void {
    if (member.conn === null) return;
    const c = this.conns.get(member.conn);
    if (c !== undefined) this.tell(c, body);
  }

  private tell(c: Conn, body: ServerBody): void {
    c.send(serverMessage(body));
  }

  private refuse(c: Conn, code: string, error: string): void {
    this.tell(c, { type: "error", code, error });
  }
}
