import { MAX_SEATS, MIN_SEATS, type Rng } from "@liars-dice/engine";
import { generateCode, normalizeCode } from "./codes.ts";
import { cleanName } from "./names.ts";
import { secureRng } from "./random.ts";

export const DEFAULT_MAX_ROOMS = 500;

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
}

export type RoomErrorCode = "bad_name" | "bad_seats" | "bad_code" | "no_room" | "room_full" | "name_taken" | "busy";
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
export type LeaveResult =
  | { readonly ok: false }
  | { readonly ok: true; readonly closed: true }
  | { readonly ok: true; readonly closed: false; readonly lobby: LobbyView };

interface Room {
  readonly code: string;
  readonly capacity: number;
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

  create(name: unknown, seats: unknown): Entered | RoomFailure {
    const clean = cleanName(name);
    if (clean === null) return fail("bad_name", "choose a name of 1 to 16 characters");
    if (typeof seats !== "number" || !Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) {
      return fail("bad_seats", `a table seats ${MIN_SEATS} to ${MAX_SEATS}`);
    }
    if (this.rooms.size >= (this.options.maxRooms ?? DEFAULT_MAX_ROOMS)) return fail("busy", "the server is busy; try again soon");
    const code = this.freshCode();
    if (code === null) return fail("busy", "the server is busy; try again soon");
    const room: Room = { code, capacity: seats, players: [] };
    this.rooms.set(code, room);
    return this.admit(room, clean);
  }

  join(code: unknown, name: unknown): Entered | RoomFailure {
    const normal = normalizeCode(code);
    if (normal === null) return fail("bad_code", "a room code is four letters");
    const room = this.rooms.get(normal);
    if (room === undefined) return fail("no_room", "there is no room with that code");
    if (room.players.length >= room.capacity) return fail("room_full", "that room is full");
    const clean = cleanName(name);
    if (clean === null) return fail("bad_name", "choose a name of 1 to 16 characters");
    if (room.players.some((p) => sameName(p.name, clean))) return fail("name_taken", "someone here already has that name");
    return this.admit(room, clean);
  }

  /** Takes a player out of the lobby. The room closes when the last one goes. */
  leave(code: string, player: PlayerId): LeaveResult {
    const room = this.rooms.get(code);
    const index = room?.players.findIndex((p) => p.id === player) ?? -1;
    if (room === undefined || index < 0) return { ok: false };
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
