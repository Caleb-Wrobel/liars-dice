import { PROTOCOL_VERSION, seededRng, type Rng, type SeatKind, type SeatView, type ServerMessage } from "@liars-dice/engine";
import WebSocket from "ws";
import { agreementProblems, leaked, livesProblems, viewProblems } from "./checks.ts";
import { chooseIntent } from "./strategy.ts";

export interface PlaytestOptions {
  /** Where the server listens, such as ws://127.0.0.1:8787/ws. */
  readonly url: string;
  /** How many rooms to play in all, and how many at once. */
  readonly rooms: number;
  /** Stop starting rooms after this many minutes (0 for no limit); rooms already under way are played to the end. */
  readonly minutes: number;
  readonly concurrency: number;
  readonly seed: number;
  readonly minHumans: number;
  readonly maxHumans: number;
  /** Bots to add to a room, up to this many. They move slowly (the server's pace), so the default is none. */
  readonly maxBots: number;
  /** Chance, after each update, that a player's connection drops and comes back with its token. */
  readonly drop: number;
  /** Of the drops, how many come back while the old connection is still open (a second tab). */
  readonly ghost: number;
  /** Chance that a player gives up their seat part-way, leaving a bot in it. */
  readonly leave: number;
  /** The longest a player thinks before a move, in milliseconds. The server limits how fast a connection may send. */
  readonly thinkMs: number;
  /** No progress for this long, with the game unfinished, is a failure. */
  readonly stallMs: number;
  readonly log: (line: string) => void;
}

export interface RoomResult {
  readonly room: number;
  readonly problems: readonly string[];
  readonly players: number;
  readonly moves: number;
  readonly drops: number;
  readonly leaves: number;
  readonly ms: number;
}

const LETTERS = "ABCDEFGHIJKL";

/**
 * The seed a room's choices come from. Rooms of one run, and of runs with seeds that are close, must not repeat one
 * another however long they go, so the seed is spread out and the room number added to it.
 */
export const roomSeed = (seed: number, index: number): number => (seed * 1_000_003 + index) >>> 0;

/** How close to the end of the game a refused resume has to fall to be put down to the game ending. */
const LATE_MS = 3000;

/** Most times one player drops in a game. Each drop is announced to the table, which tempts everyone else to drop in
 * turn, so without a limit a big room can feed on itself for a very long time. */
const MAX_DROPS = 8;

/** The most a table seats. The server owns this number and refuses more; the playtest only has to stay inside it. */
const MAX_SEATS = 6;

/** One simulated person: a connection, the secret that is theirs, and only the views the server sent them. */
class Player {
  ws: WebSocket | null = null;
  /** Bumped at each connection, so a message from a connection that has been replaced is known for what it is. */
  gen = 0;
  token = "";
  seat: number | undefined;
  view: SeatView | undefined;
  kinds: readonly SeatKind[] = [];
  code = "";
  timer: ReturnType<typeof setTimeout> | null = null;
  awaiting = false;
  finished = false;
  left = false;
  /** Has said it is leaving and is waiting to be told it has gone; until then it makes no moves and does not drop. */
  leaving = false;
  updates = 0;
  leaveAt: number;
  moves = 0;
  drops = 0;
  /** When the server said this place was no longer theirs, and what it said. */
  refused: { at: number; text: string } | null = null;
  /** The last few things that happened to this player and when, so a failure can say how it came about. */
  trail: string[] = [];

  constructor(
    readonly name: string,
    readonly rng: Rng,
    leaveAfter: number,
  ) {
    this.leaveAt = leaveAfter;
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  send(message: Record<string, unknown>): void {
    if (this.connected) this.ws!.send(JSON.stringify({ v: PROTOCOL_VERSION, ...message }));
  }
}

class Room {
  private readonly players: Player[] = [];
  private readonly problems: string[] = [];
  private readonly rng: Rng;
  private readonly humans: number;
  private readonly bots: number;
  private readonly lives: number;
  private readonly advanced: boolean;
  private started = false;
  private sawWinner = false;
  private wonAt = 0;
  private lastProgress = Date.now();
  private began = Date.now();
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private finish!: () => void;
  private readonly done = new Promise<void>((resolve) => (this.finish = resolve));
  private drops = 0;
  private leaves = 0;

  constructor(
    private readonly index: number,
    private readonly opts: PlaytestOptions,
  ) {
    this.rng = seededRng(roomSeed(opts.seed, index));
    const span = opts.maxHumans - opts.minHumans + 1;
    this.humans = opts.minHumans + Math.floor(this.rng() * span);
    // A table seats at most six, people and bots together.
    this.bots = Math.min(Math.floor(this.rng() * (opts.maxBots + 1)), MAX_SEATS - this.humans);
    this.lives = 1 + Math.floor(this.rng() * 3);
    this.advanced = this.rng() < 0.5;
    for (let i = 0; i < this.humans; i++) {
      // The first player stays to the end, so a room is never left with nobody to finish it.
      const leaves = i > 0 && this.rng() < opts.leave;
      this.players.push(new Player(`Test ${LETTERS[i]}${index}`, seededRng(roomSeed(opts.seed, index) * 16 + i + 1), leaves ? 3 + Math.floor(this.rng() * 25) : Infinity));
    }
  }

  async play(): Promise<RoomResult> {
    const began = (this.began = Date.now());
    this.watchdog = setInterval(() => this.checkStall(), 1000);
    try {
      const host = this.players[0]!;
      await this.open(host);
      host.send({ type: "create", name: host.name, seats: this.humans + this.bots, lives: this.lives, advanced: this.advanced });
      await this.done;
    } catch (error) {
      this.fail(`the room could not be played: ${String(error)}`);
    } finally {
      clearInterval(this.watchdog);
      for (const p of this.players) this.close(p);
    }
    this.finalChecks();
    return {
      room: this.index,
      problems: this.problems,
      players: this.humans,
      moves: this.players.reduce((n, p) => n + p.moves, 0),
      drops: this.drops,
      leaves: this.leaves,
      ms: Date.now() - began,
    };
  }

  private note(p: Player, what: string): void {
    p.trail.push(`${((Date.now() - this.began) / 1000).toFixed(1)}s ${what}`);
    if (p.trail.length > 14) p.trail.shift();
  }

  private fail(problem: string): void {
    if (this.problems.length < 20) this.problems.push(problem);
    this.finish();
  }

  private open(p: Player): Promise<void> {
    const gen = ++p.gen;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.opts.url);
      p.ws = ws;
      ws.once("open", () => resolve());
      ws.once("error", reject);
      ws.on("message", (data) => this.receive(p, gen, data.toString()));
      ws.on("close", () => {
        if (p.gen === gen && !p.finished && !p.left && !this.sawWinner) p.ws = null;
      });
    });
  }

  private close(p: Player): void {
    if (p.timer !== null) clearTimeout(p.timer);
    p.timer = null;
    p.ws?.terminate();
  }

  private checkStall(): void {
    if (this.sawWinner || Date.now() - this.lastProgress < this.opts.stallMs) return;
    const where = this.players.map((p) => `${p.name}: ${p.connected ? "connected" : "away"}, turn ${p.view?.current ?? "?"}, step ${p.view?.step ?? "?"}, open [${p.view?.available.join(" ") ?? ""}]`);
    this.fail(`no progress for ${this.opts.stallMs / 1000} seconds. ${where.join("; ")}`);
  }

  private receive(p: Player, gen: number, raw: string): void {
    this.lastProgress = Date.now();
    // Nobody may ever read another person's secret. Each token is checked against every message the others receive.
    const others = new Map(this.players.filter((q) => q !== p).map((q) => [q.name, q.token]));
    for (const whose of leaked(raw, others)) this.fail(`${p.name} was sent ${whose}'s token`);
    let m: ServerMessage;
    try {
      m = JSON.parse(raw) as ServerMessage;
    } catch {
      return this.fail(`${p.name} was sent something that is not JSON`);
    }
    if (gen !== p.gen) return; // a connection that was replaced; its last words (`replaced`) are expected
    switch (m.type) {
      case "joined":
        this.note(p, m.view === undefined ? "joined" : "resumed");
        p.token = m.token;
        p.code = m.code;
        if (m.view !== undefined) this.take(p, m.view, m.kinds ?? p.kinds);
        else if (p === this.players[0]) this.joinOthers(m.code);
        return this.lobbyChanged(p, m.lobby.players.length);
      case "lobby":
        return this.lobbyChanged(p, m.lobby.players.length);
      case "started":
      case "state":
        return this.take(p, m.view, m.kinds);
      case "left":
        this.note(p, "told it has left");
        p.left = true;
        return this.close(p), this.maybeFinish();
      case "replaced":
        return this.fail(`${p.name}'s live connection was told it was replaced`);
      case "error":
        // A seat that drops as the game ends is let go at once, so its resume is refused. That is by design (nobody is
        // waiting on a finished game), but only if the game really did end then, which `finalChecks` weighs.
        if (m.code === "unknown_token") {
          this.note(p, "refused: unknown token");
          p.refused = { at: Date.now(), text: `${m.code}: ${m.error}` };
          p.finished = true;
          return this.maybeFinish();
        }
        return this.fail(`${p.name} was refused: ${m.code}: ${m.error}`);
    }
  }

  private async joinOthers(code: string): Promise<void> {
    for (const p of this.players.slice(1)) {
      try {
        await this.open(p);
        p.send({ type: "join", code, name: p.name });
      } catch (error) {
        return this.fail(`${p.name} could not connect: ${String(error)}`);
      }
    }
  }

  private lobbyChanged(p: Player, size: number): void {
    if (p === this.players[0] && !this.started && size === this.humans) {
      this.started = true;
      p.send({ type: "start" });
    }
  }

  /** A new view arrived: hold the server to what a view promises, then decide whether to drop, leave or move. */
  private take(p: Player, view: SeatView, kinds: readonly SeatKind[]): void {
    const problems = [...viewProblems(view, p.seat), ...livesProblems(p.view, view)];
    for (const problem of problems) this.fail(`${p.name}: ${problem}`);
    p.seat ??= view.you;
    p.view = view;
    p.kinds = kinds;
    p.awaiting = false;
    p.updates++;
    if (view.winner !== null) {
      p.finished = true;
      this.note(p, "sees the winner");
      if (!this.sawWinner) this.wonAt = Date.now();
      this.sawWinner = true;
      return this.maybeFinish();
    }
    if (p.leaving) return;
    if (p.updates >= p.leaveAt) {
      p.leaveAt = Infinity;
      p.leaving = true;
      this.note(p, "sends leave");
      this.leaves++;
      p.send({ type: "leave" });
      return;
    }
    if (p.drops < MAX_DROPS && p.rng() < this.opts.drop) return this.drop(p);
    this.schedule(p);
  }

  private schedule(p: Player): void {
    if (p.timer !== null || p.awaiting || p.finished || p.left || p.view === undefined || p.view.available.length === 0) return;
    p.timer = setTimeout(() => {
      p.timer = null;
      const intent = p.view === undefined ? null : chooseIntent(p.view, p.rng);
      if (intent === null || !p.connected) return;
      p.awaiting = true;
      p.moves++;
      p.send({ type: "intent", intent });
    }, p.rng() * this.opts.thinkMs);
  }

  /** The connection goes, and the player comes back with only their token, maybe while the old one is still open. */
  private drop(p: Player): void {
    this.drops++;
    p.drops++;
    this.note(p, "drops");
    if (p.timer !== null) clearTimeout(p.timer);
    p.timer = null;
    const ghost = p.rng() < this.opts.ghost;
    const old = p.ws;
    if (!ghost) old?.terminate();
    // The old connection is as good as gone to this player, even if it is still open: nothing it says is acted on.
    p.gen++;
    setTimeout(() => {
      // Someone who left, or who has seen the end, has nothing to come back to.
      if (p.left || p.finished) return old?.terminate();
      this.open(p).then(
        () => {
          p.awaiting = false;
          this.note(p, "sends resume");
          p.send({ type: "resume", token: p.token });
          if (ghost) setTimeout(() => old?.terminate(), 200);
        },
        (error) => this.fail(`${p.name} could not reconnect: ${String(error)}`),
      );
    }, p.rng() * 1500);
  }

  private maybeFinish(): void {
    if (this.players.every((p) => p.finished || p.left)) this.finish();
  }

  private finalChecks(): void {
    const stayers = this.players.filter((p) => !p.left && p.view !== undefined);
    // A refused resume is fine only if the game ended within moments of it; a place lost mid-game is not.
    for (const p of this.players) {
      if (p.refused !== null && (!this.sawWinner || Math.abs(this.wonAt - p.refused.at) > LATE_MS)) {
        this.problems.push(`${p.name} was refused (${p.refused.text}) with the game ${this.sawWinner ? `still on for ${((this.wonAt - p.refused.at) / 1000).toFixed(1)}s` : "never finished"}; ${p.trail.join(", ")}; others: ${this.players.filter((q) => q !== p).map((q) => `${q.name} ${q.left ? "left" : q.finished ? "finished" : "playing"}`).join(", ")}`);
      }
    }
    if (!this.sawWinner) return void (this.problems.length > 0 || this.problems.push("the game never finished"));
    const views = stayers.flatMap((p) => (p.view?.winner != null ? [p.view] : []));
    for (const problem of agreementProblems(views)) this.problems.push(problem);
    // Someone who left must show as a bot to those still at the table.
    for (const gone of this.players.filter((p) => p.left && p.seat !== undefined)) {
      for (const p of stayers) {
        if (p.kinds[gone.seat!] !== "bot") this.problems.push(`${p.name} still sees ${gone.name}'s seat as ${p.kinds[gone.seat!]}`);
      }
    }
  }
}

/** Plays `opts.rooms` whole games against the server, `opts.concurrency` at a time. */
export async function playtest(opts: PlaytestOptions): Promise<RoomResult[]> {
  const results: RoomResult[] = [];
  const until = opts.minutes > 0 ? Date.now() + opts.minutes * 60_000 : Infinity;
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < opts.rooms && Date.now() < until; i = next++) {
      const result = await new Room(i, opts).play();
      results.push(result);
      const verdict = result.problems.length === 0 ? "clean" : `${result.problems.length} PROBLEM(S)`;
      opts.log(`room ${i}: ${result.players} players, ${result.moves} moves, ${result.drops} drops, ${result.leaves} leaves, ${(result.ms / 1000).toFixed(1)}s, ${verdict}`);
      for (const problem of result.problems) opts.log(`  - ${problem}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, opts.rooms) }, worker));
  if (Date.now() >= until) opts.log(`the ${opts.minutes} minutes were up; rooms under way were played to the end`);
  return results.sort((a, b) => a.room - b.room);
}
