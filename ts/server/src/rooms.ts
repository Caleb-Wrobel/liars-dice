import { MAX_SEATS, MIN_SEATS, type Rng } from "@liars-dice/engine";
import { generateCode, normalizeCode } from "./codes.ts";
import { cleanName } from "./names.ts";
import { secureRng } from "./random.ts";

export const DEFAULT_MAX_ROOMS = 500;
export const MIN_LIVES = 1;
export const MAX_LIVES = 5;
export const DEFAULT_LIVES = 3;

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

/** Everything a match needs from a lobby when the host starts the game. */
export interface MatchSetup {
  readonly code: string;
  readonly capacity: number;
  readonly lives: number;
  readonly advanced: boolean;
  /** In the order they joined; the first is the host. */
  readonly players: readonly LobbyPlayer[];
}

export type RoomErrorCode =
  | "bad_name"
  | "bad_seats"
  | "bad_rules"
  | "bad_code"
  | "no_room"
  | "room_full"
  | "name_taken"
  | "busy"
  | "started"
  | "not_host";
export interface RoomFailure {
  readonly ok: false;
  readonly code: RoomErrorCode;
  readonly error: string;
}
export interface Entered {
  readonly ok: true;
  readonly code: string;
  readonly player: PlayerId;
  readonly lobby: LobbyView;
}
export type Started =
  | { readonly ok: true; readonly setup: MatchSetup }
  | RoomFailure;
export type LeaveResult =
  | { readonly ok: false }
  | { readonly ok: true; readonly closed: true }
  | { readonly ok: true; readonly closed: false; readonly lobby: LobbyView };

interface Room {
  readonly code: string;
  readonly capacity: number;
  readonly lives: number;
  readonly advanced: boolean;
  /** Once the host starts the game the lobby is closed: nobody joins, and leaving is the match's business. */
  phase: "lobby" | "playing";
  readonly players: LobbyPlayer[];
}

const fail = (code: RoomErrorCode, error: string): RoomFailure => ({ ok: false, code, error });
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Every room, in memory. There is no database: a restart ends them all, which suits anonymous games among friends.
 * It knows nothing about connections; the layer above maps whoever is connected to a PlayerId. Input is untrusted
 * (names, codes and seat counts arrive as `unknown`), and a bad request is turned away with a reason and changes nothing.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private nextPlayer = 1;

  constructor(
    private readonly options: { readonly rng?: Rng; readonly maxRooms?: number } = {},
  ) {}

  /** How many rooms exist. */
  get size(): number {
    return this.rooms.size;
  }

  create(name: unknown, seats: unknown, rules: { lives?: unknown; advanced?: unknown } = {}): Entered | RoomFailure {
    const clean = cleanName(name);
    if (clean === null) return fail("bad_name", "choose a name of 1 to 16 characters");
    if (typeof seats !== "number" || !Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) {
      return fail("bad_seats", `a table seats ${MIN_SEATS} to ${MAX_SEATS}`);
    }
    const lives = rules.lives === undefined ? DEFAULT_LIVES : rules.lives; // only "not given" means the default
    if (typeof lives !== "number" || !Number.isInteger(lives) || lives < MIN_LIVES || lives > MAX_LIVES) {
      return fail("bad_rules", `players start with ${MIN_LIVES} to ${MAX_LIVES} lives`);
    }
    const advanced = rules.advanced === undefined ? false : rules.advanced;
    if (typeof advanced !== "boolean") return fail("bad_rules", "the rules are basic or advanced");
    if (this.rooms.size >= (this.options.maxRooms ?? DEFAULT_MAX_ROOMS)) return fail("busy", "the server is busy; try again soon");
    const code = this.freshCode();
    if (code === null) return fail("busy", "the server is busy; try again soon");
    const room: Room = { code, capacity: seats, lives, advanced, phase: "lobby", players: [] };
    this.rooms.set(code, room);
    return this.admit(room, clean);
  }

  join(code: unknown, name: unknown): Entered | RoomFailure {
    const normal = normalizeCode(code);
    if (normal === null) return fail("bad_code", "a room code is four letters");
    const room = this.rooms.get(normal);
    if (room === undefined) return fail("no_room", "there is no room with that code");
    if (room.phase !== "lobby") return fail("started", "that game has already started");
    if (room.players.length >= room.capacity) return fail("room_full", "that room is full");
    const clean = cleanName(name);
    if (clean === null) return fail("bad_name", "choose a name of 1 to 16 characters");
    if (room.players.some((p) => sameName(p.name, clean))) return fail("name_taken", "someone here already has that name");
    return this.admit(room, clean);
  }

  /**
   * The host closes the lobby and the game begins. Only the host may, and only once: from then on nobody can join. The
   * setup it returns is what a match is made from.
   */
  start(code: string, player: PlayerId): Started {
    const room = this.rooms.get(code);
    if (room === undefined) return fail("no_room", "there is no room with that code");
    if (room.phase !== "lobby") return fail("started", "that game has already started");
    if (room.players[0]!.id !== player) return fail("not_host", "only the host can start the game");
    room.phase = "playing";
    return {
      ok: true,
      setup: {
        code: room.code,
        capacity: room.capacity,
        lives: room.lives,
        advanced: room.advanced,
        players: room.players.map((p) => ({ ...p })),
      },
    };
  }

  /** Forgets a room, for instance when its game is over and everyone has gone. */
  close(code: string): boolean {
    return this.rooms.delete(code);
  }

  /** Takes a player out of the lobby. The room closes when the last one goes. Once the game has started, no. */
  leave(code: string, player: PlayerId): LeaveResult {
    const room = this.rooms.get(code);
    const index = room?.players.findIndex((p) => p.id === player) ?? -1;
    if (room === undefined || room.phase !== "lobby" || index < 0) return { ok: false };
    room.players.splice(index, 1);
    if (room.players.length === 0) {
      this.rooms.delete(code);
      return { ok: true, closed: true };
    }
    return { ok: true, closed: false, lobby: this.view(room) };
  }

  lobby(code: string): LobbyView | undefined {
    const room = this.rooms.get(code);
    return room === undefined ? undefined : this.view(room);
  }

  private admit(room: Room, name: string): Entered {
    const player = this.nextPlayer++;
    room.players.push({ id: player, name });
    return { ok: true, code: room.code, player, lobby: this.view(room) };
  }

  private view(room: Room): LobbyView {
    return {
      code: room.code,
      capacity: room.capacity,
      host: room.players[0]!.id,
      players: room.players.map((p) => ({ ...p })),
      bots: room.capacity - room.players.length,
      lives: room.lives,
      advanced: room.advanced,
    };
  }

  /** A code nobody is using, or null if the codes are somehow all taken (the server is then far past busy). */
  private freshCode(): string | null {
    const rng = this.options.rng ?? secureRng;
    for (let tries = 0; tries < 200; tries++) {
      const code = generateCode(rng);
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }
}
