/**
 * The core: one game, driven only by intents, answering with public events and a view for every seat.
 *
 * It knows nothing about sockets, screens or timers, so the same module can run in the browser (local and hot-seat
 * play) and on a server. Everything a player sends is untrusted: a message that is malformed, out of turn, or against
 * the rules is turned away with a message and changes nothing. The engine stays the only judge of what is legal. The
 * core only checks that the message is shaped like an intent and that it is that seat's turn.
 *
 * Events are the public log: they say what happened, never what a roll or a peek showed. The one exception is a pull,
 * which turns every die face up for the whole table, as at a physical table. Private results reach only the actor,
 * through their view. See docs/multiplayer.md ("The core").
 */
import { type Bot, type BotStep } from "./bot.ts";
import { type DiceSet, type Game, type PullResult, RuleError } from "./game.ts";
import { NUM_DICE, type Rank } from "./ranks.ts";
import { view, type SeatView } from "./view.ts";

/** What a seat may ask for. They mirror the engine's own actions. */
export type Intent =
  | { readonly action: "pull" }
  | { readonly action: "peer" }
  | { readonly action: "rearrange"; readonly visible: readonly number[] }
  | { readonly action: "roll"; readonly set?: DiceSet }
  | { readonly action: "peek" }
  | { readonly action: "claim"; readonly rank: Rank };

/** What the table is told. Public by construction: no hidden face appears in any of them but `pulled`. */
export type GameEvent =
  | { readonly type: "rearranged"; readonly seat: number; readonly visible: readonly number[] }
  | { readonly type: "rolled"; readonly seat: number; readonly set: DiceSet }
  | { readonly type: "peered"; readonly seat: number }
  | { readonly type: "peeked"; readonly seat: number }
  | { readonly type: "claimed"; readonly seat: number; readonly rank: Rank }
  | ({ readonly type: "pulled"; readonly seat: number } & PullResult)
  | { readonly type: "round"; readonly opener: number }
  | { readonly type: "won"; readonly seat: number };

export type Applied =
  | { readonly ok: true; readonly events: readonly GameEvent[]; readonly views: readonly SeatView[] }
  | { readonly ok: false; readonly error: string };

export type BotApplied =
  | {
      readonly ok: true;
      readonly step: BotStep;
      readonly events: readonly GameEvent[];
      readonly views: readonly SeatView[];
    }
  | { readonly ok: false; readonly error: string };

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);
const isIntArray = (x: unknown, max: number): x is number[] => Array.isArray(x) && x.length <= max && x.every(isInt);

/** Turns whatever arrived into an intent, or null if it is not shaped like one. Whether it is legal is the engine's call. */
export function parseIntent(raw: unknown): Intent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const msg = raw as Record<string, unknown>;
  switch (msg.action) {
    case "pull":
    case "peer":
    case "peek":
      return { action: msg.action };
    case "rearrange":
      return isIntArray(msg.visible, NUM_DICE) ? { action: "rearrange", visible: [...msg.visible] } : null;
    case "roll":
      if (msg.set === undefined) return { action: "roll" };
      return msg.set === "hidden" || msg.set === "visible" ? { action: "roll", set: msg.set } : null;
    case "claim": {
      const rank = msg.rank as Record<string, unknown> | null | undefined;
      if (typeof rank !== "object" || rank === null) return null;
      if (!isInt(rank.category) || !isIntArray(rank.faces, 2) || !isInt(rank.kicker)) return null;
      return { action: "claim", rank: { category: rank.category as Rank["category"], faces: [...rank.faces], kicker: rank.kicker } };
    }
    default:
      return null;
  }
}

export class Core {
  constructor(readonly game: Game) {}

  /** The view for every seat, in seat order. */
  views(): SeatView[] {
    return this.game.names.map((_, seat) => view(this.game, seat));
  }

  /**
   * Apply one seat's intent. Never throws for bad input: it answers `{ ok: false, error }` and the game is unchanged.
   * On success, the events say what everyone saw, and `views` holds each seat's own view afterwards.
   */
  apply(seat: number, raw: unknown): Applied {
    const turn = this.checkTurn(seat);
    if (turn !== null) return { ok: false, error: turn };
    const intent = parseIntent(raw);
    if (intent === null) return { ok: false, error: "that is not a move" };
    const events: GameEvent[] = [];
    try {
      this.perform(seat, intent, events);
    } catch (e) {
      if (e instanceof RuleError) return { ok: false, error: e.message };
      throw e;
    }
    return { ok: true, events, views: this.views() };
  }

  /**
   * Let a bot take its next visible move for `seat`. The bot acts through the same checks as a person: its moves go
   * through `perform`, so they produce the same events. Bots are server code and may read the whole game.
   */
  stepBot(seat: number, bot: Bot, say?: (text: string) => void): BotApplied {
    const turn = this.checkTurn(seat);
    if (turn !== null) return { ok: false, error: turn };
    const events: GameEvent[] = [];
    const step = bot.step(this.actingAs(seat, events), say);
    return { ok: true, step, events, views: this.views() };
  }

  private checkTurn(seat: number): string | null {
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.game.names.length) return "there is no such seat";
    if (this.game.winner !== null) return "the game is over";
    if (seat !== this.game.current) return "it is not your turn";
    return null;
  }

  /** Do one intent, appending its public events. Returns what the engine returned, for a bot that needs it. */
  private perform(seat: number, intent: Intent, events: GameEvent[]): unknown {
    const g = this.game;
    switch (intent.action) {
      case "pull": {
        const result = g.pull();
        events.push({ type: "pulled", seat, ...result });
        if (g.winner !== null) events.push({ type: "won", seat: g.winner });
        else events.push({ type: "round", opener: g.current });
        return result;
      }
      case "peer": {
        const dice = g.peer();
        events.push({ type: "peered", seat });
        return dice;
      }
      case "rearrange":
        g.rearrange(intent.visible);
        events.push({ type: "rearranged", seat, visible: [...g.visible].sort((a, b) => a - b) });
        return undefined;
      case "roll": {
        const set = intent.set ?? "hidden";
        g.roll(set);
        events.push({ type: "rolled", seat, set });
        return undefined;
      }
      case "peek": {
        const dice = g.peek();
        events.push({ type: "peeked", seat });
        return dice;
      }
      case "claim":
        g.makeClaim(intent.rank);
        events.push({ type: "claimed", seat, rank: intent.rank });
        return undefined;
    }
  }

  /**
   * The game as a bot sees it: every read goes straight to the game, but its six moves go through `perform`, so
   * they are checked the same way and leave the same events behind.
   */
  private actingAs(seat: number, events: GameEvent[]): Game {
    const g = this.game;
    return new Proxy(g, {
      get: (target, prop) => {
        switch (prop) {
          case "pull":
            return () => this.perform(seat, { action: "pull" }, events) as PullResult;
          case "peer":
            return () => this.perform(seat, { action: "peer" }, events) as number[];
          case "rearrange":
            return (visible: Iterable<number>) => this.perform(seat, { action: "rearrange", visible: [...visible] }, events);
          case "roll":
            return (set?: DiceSet) => this.perform(seat, set === undefined ? { action: "roll" } : { action: "roll", set }, events);
          case "peek":
            return () => this.perform(seat, { action: "peek" }, events) as number[];
          case "makeClaim":
            return (rank: Rank) => this.perform(seat, { action: "claim", rank }, events);
          default: {
            const value = Reflect.get(target, prop) as unknown;
            return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
          }
        }
      },
    });
  }
}
