import {
  BOT_NAMES,
  Bot,
  Core,
  Game,
  advancedRules,
  basicRules,
  botDelayMs,
  shuffled,
  type BotPace,
  type GameEvent,
  type Rng,
  type SeatView,
} from "@liars-dice/engine";
import type { MatchSetup, PlayerId } from "./rooms.ts";

/** Timers, so a test can run a whole game without waiting. The server uses the real one. */
export interface Clock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** What happened, and what every seat may now see of it. Indexed by seat. */
export interface MatchUpdate {
  readonly events: readonly GameEvent[];
  readonly views: readonly SeatView[];
}

export interface MatchOptions {
  /** Shuffles the seats and rolls the dice. The server uses secure randomness so dice cannot be predicted. */
  readonly rng: Rng;
  readonly clock: Clock;
  /** How fast the bots move. Defaults to normal. */
  readonly pace?: BotPace;
  /** Called whenever the game moves on: a player's move, or a bot's. */
  readonly onUpdate: (update: MatchUpdate) => void;
}

export type SeatInfo =
  | { readonly kind: "human"; readonly name: string; readonly player: PlayerId }
  | { readonly kind: "bot"; readonly name: string };

export type Submitted = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** Names for `count` plain bots that no human already has (ignoring case), falling back to "Bot 1", "Bot 2". */
export function botNames(count: number, taken: readonly string[]): string[] {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  const names: string[] = [];
  const take = (name: string) => {
    if (names.length < count && !used.has(name.toLowerCase())) {
      used.add(name.toLowerCase());
      names.push(name);
    }
  };
  for (const name of BOT_NAMES) take(name);
  for (let n = 1; names.length < count; n++) take(`Bot ${n}`);
  return names;
}

/**
 * One game, from the host pressing Start. Humans and generic bots are shuffled into seats, the engine's core runs the
 * game, and bots take their turns on the clock at a pace a person can follow. The match knows nothing about
 * connections: it reports each change through `onUpdate` and answers moves from a PlayerId. See
 * docs/multiplayer.md.
 */
export class Match {
  readonly seats: readonly SeatInfo[];
  /** Every seat's view as the game begins, with the opening round announced; the server sends it at Start. */
  readonly initial: MatchUpdate;
  private readonly core: Core;
  private readonly bots = new Map<number, Bot>();
  private readonly seatOfPlayer = new Map<PlayerId, number>();
  private timer: unknown = null;
  private stopped = false;

  constructor(
    setup: MatchSetup,
    private readonly options: MatchOptions,
  ) {
    const bots = botNames(
      setup.capacity - setup.players.length,
      setup.players.map((p) => p.name),
    ).map((name): SeatInfo => ({ kind: "bot", name }));
    const humans = setup.players.map((p): SeatInfo => ({ kind: "human", name: p.name, player: p.id }));
    this.seats = shuffled([...humans, ...bots], options.rng);
    this.seats.forEach((seat, index) => {
      if (seat.kind === "human") this.seatOfPlayer.set(seat.player, index);
      else this.bots.set(index, new Bot({ level: "normal", rng: options.rng }));
    });
    const rules = setup.advanced ? advancedRules(setup.lives) : basicRules(setup.lives);
    const game = new Game(
      this.seats.map((s) => s.name),
      rules,
      options.rng,
      "random",
    );
    this.core = new Core(game);
    this.initial = { events: [{ type: "round", opener: game.current }], views: this.core.views() };
    this.schedule();
  }

  /** The seat that has won, or null while the game is on. */
  get winner(): number | null {
    return this.core.game.winner;
  }

  seatOf(player: PlayerId): number | undefined {
    return this.seatOfPlayer.get(player);
  }

  /** What this player may see of the game, or undefined if they are not in it. */
  view(player: PlayerId): SeatView | undefined {
    const seat = this.seatOf(player);
    return seat === undefined ? undefined : this.core.views()[seat];
  }

  /** A player's move. Refused, with a reason, if they are not in the game, it is not their turn or it is not legal. */
  submit(player: PlayerId, intent: unknown): Submitted {
    const seat = this.seatOf(player);
    if (seat === undefined) return { ok: false, error: "you are not in this game" };
    const res = this.core.apply(seat, intent);
    if (!res.ok) return res;
    this.options.onUpdate({ events: res.events, views: res.views });
    this.schedule();
    return { ok: true };
  }

  /** Stops the bots, for when the room closes. */
  stop(): void {
    this.stopped = true;
    this.cancel();
  }

  private cancel(): void {
    if (this.timer !== null) this.options.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  /** If it is a bot's turn, have it move after a human-sized pause. */
  private schedule(): void {
    this.cancel();
    const game = this.core.game;
    if (this.stopped || game.winner !== null || !this.bots.has(game.current)) return;
    const delay = botDelayMs(this.options.pace ?? "normal", game.step);
    this.timer = this.options.clock.setTimeout(() => this.botMove(), delay);
  }

  private botMove(): void {
    this.timer = null;
    const seat = this.core.game.current;
    const bot = this.bots.get(seat);
    if (this.stopped || bot === undefined) return;
    const res = this.core.stepBot(seat, bot);
    // A bot's quiet moves, like keeping its dice, change nothing anyone can see, so there is nothing to report.
    if (res.ok && res.events.length > 0) this.options.onUpdate({ events: res.events, views: res.views });
    this.schedule();
  }
}
