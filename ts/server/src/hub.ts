import type { BotPace, Rng } from "@liars-dice/engine";
import { Match, type Clock, type MatchUpdate } from "./match.ts";
import {
  parseClientMessage,
  serverMessage,
  type ClientMessage,
  type ServerBody,
  type ServerMessage,
} from "./protocol.ts";
import { newToken } from "./random.ts";
import { RoomRegistry, type Entered, type LobbyView, type PlayerId } from "./rooms.ts";

export type ConnId = number;
export type Send = (message: ServerMessage) => void;

export interface HubOptions {
  /** Codes, tokens, shuffles and dice. The server passes secure randomness; tests pass a seeded one. */
  readonly rng: Rng;
  readonly clock: Clock;
  readonly pace?: BotPace;
  readonly maxRooms?: number;
}

/** One person's place in a room, for as long as they are in it. */
interface Member {
  readonly player: PlayerId;
  readonly name: string;
  readonly token: string;
  readonly code: string;
  /** Their connection right now, or null while they are not connected. */
  conn: ConnId | null;
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
    if (c.member !== null) c.member.conn = null;
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
        const room = this.rooms.get(member.code)!;
        if (room.match !== null) return this.refuse(c, "in_game", "leaving a game in progress is not supported yet");
        this.registry.leave(member.code, member.player);
        room.members.splice(room.members.indexOf(member), 1);
        c.member = null;
        this.tell(c, { type: "left" });
        if (room.members.length === 0) this.rooms.delete(room.code);
        else this.broadcastLobby(room);
        return;
      }
      case "resume":
        return this.refuse(c, "unsupported", "resuming is not supported yet");
    }
  }

  /** Puts a connection into the room it just created or joined. */
  private admit(conn: ConnId, c: Conn, res: Entered): void {
    const room = this.rooms.get(res.code)!;
    const name = res.lobby.players.find((p) => p.id === res.player)!.name;
    const member: Member = { player: res.player, name, token: newToken(this.options.rng), code: res.code, conn };
    room.members.push(member);
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
      this.toMember(m, { type, view: update.views[seat]!, events: update.events });
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
