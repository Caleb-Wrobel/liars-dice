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
  type PlayerId,
  type Rng,
  type SeatKind,
  type SeatView,
} from "@liars-dice/engine";
import type { MatchSetup } from "./rooms.ts";

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
  /** Who holds each seat at this moment. */
  readonly kinds: readonly SeatKind[];
}

/**
 * Bots online are slow by default. Nobody shares a screen, so each player follows the table in their own log, and a bot
 * can take a seat in a game that began with only people (when someone drops), so a quick bot would read as a jolt
 * whoever it replaced. Hot-seat keeps its own, faster default. A room cannot choose yet; see the pace issue on the tracker.
 */
export const DEFAULT_PACE: BotPace = "slow";

export interface MatchOptions {
  /** Shuffles the seats and rolls the dice. The server uses secure randomness so dice cannot be predicted. */
  readonly rng: Rng;
  readonly clock: Clock;
  /** How fast the bots move. Defaults to `DEFAULT_PACE`. */
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
  private readonly seatList: SeatInfo[];
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
    this.seatList = shuffled([...humans, ...bots], options.rng);
    this.seatList.forEach((seat, index) => {
      if (seat.kind === "human") this.seatOfPlayer.set(seat.player, index);
      else this.bots.set(index, new Bot({ level: "normal", rng: options.rng }));
    });
    const rules = setup.advanced ? advancedRules(setup.lives) : basicRules(setup.lives);
    const game = new Game(
      this.seatList.map((s) => s.name),
      rules,
      options.rng,
      "random",
    );
    this.core = new Core(game);
    this.initial = { events: [{ type: "round", opener: game.current }], views: this.core.views(), kinds: this.kinds };
    this.schedule();
  }

  /** Who sits where. A seat a human gave up shows as a bot, under the name the game knows it by. */
  get seats(): readonly SeatInfo[] {
    return this.seatList;
  }

  /** The seat that has won, or null while the game is on. */
  get winner(): number | null {
    return this.core.game.winner;
  }

  /** Who holds each seat, in seat order. */
  get kinds(): readonly SeatKind[] {
    return this.seatList.map((s) => s.kind);
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
    this.options.onUpdate({ events: res.events, views: res.views, kinds: this.kinds });
    this.schedule();
    return { ok: true };
  }

  /**
   * A fresh normal bot takes this player's seat for the rest of the game, carrying on from the exact state of play (a
   * bot has no memory of the round to inherit). The player can no longer move or see. Returns the seat, or undefined if
   * they hold none.
   */
  takeOver(player: PlayerId): number | undefined {
    const seat = this.seatOfPlayer.get(player);
    if (seat === undefined) return undefined;
    this.seatOfPlayer.delete(player);
    this.seatList[seat] = { kind: "bot", name: this.seatList[seat]!.name };
    this.bots.set(seat, new Bot({ level: "normal", rng: this.options.rng }));
    // A move already on the clock is another bot's, and keeps its pause.
    if (this.timer === null) this.schedule();
    return seat;
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
    const delay = botDelayMs(this.options.pace ?? DEFAULT_PACE, game.step);
    this.timer = this.options.clock.setTimeout(() => this.botMove(), delay);
  }

  private botMove(): void {
    this.timer = null;
    const seat = this.core.game.current;
    const bot = this.bots.get(seat);
    if (this.stopped || bot === undefined) return;
    const res = this.core.stepBot(seat, bot);
    // A bot's quiet moves, like keeping its dice, change nothing anyone can see, so there is nothing to report.
    if (res.ok && res.events.length > 0) this.options.onUpdate({ events: res.events, views: res.views, kinds: this.kinds });
    this.schedule();
  }
}
