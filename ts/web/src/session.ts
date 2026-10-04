import {
  Bot,
  BOT_NAMES,
  Core,
  Game,
  MAX_SEATS,
  NUM_DICE,
  RuleError,
  advancedRules,
  basicRules,
  botDelayMs,
  drawArchetypes,
  formatRank,
  rollPhrase,
  randomBotLevel,
  seededRng,
  view as seatViewOf,
  type BotLevel,
  type DiceSet,
  type GameEvent,
  type Intent,
  type PullResult,
  type Rank,
  type SeatView,
} from "@liars-dice/engine";
import { useEffect, useState } from "react";
import { personaFor } from "./personas/index.ts";
import { DEFAULT_THEME, type ThemeId } from "./theme.ts";

/** The player's seat when playing alone against bots. With several humans, seats are shuffled; ask `isHuman`. */
export const HUMAN = 0;

/** How fast the bots move. "step" waits for you to press Next move after each action. */
export type Pace = "fast" | "normal" | "slow" | "step";
export const PACES: readonly Pace[] = ["fast", "normal", "slow", "step"];
// The pace, the seat limits and the plain bots' names are shared with the server, so a table is the same everywhere.
export { BOT_NAMES, BOT_PACE_MS as PACE_MS, DECISION_BEAT, MAX_SEATS } from "@liars-dice/engine";

/** A fixed level for every bot, or "random" to give each bot its own, drawn when the game starts. */
export type LevelChoice = BotLevel | "random";

export interface Config {
  readonly name: string;
  /**
   * The names of any other humans sharing this device, for hot-seat play. With none, you play alone against bots.
   * Everyone is shuffled into random seats when there is more than one human.
   */
  readonly otherHumans?: readonly string[];
  readonly lives: number;
  readonly advanced: boolean;
  /**
   * How many bots sit at the table. Defaults to 1. A lone human needs at least one; the table never exceeds
   * MAX_SEATS, so the count is trimmed to fit.
   */
  readonly opponents?: number;
  /** How the bots play. Defaults to "normal". */
  readonly level?: LevelChoice;
  /**
   * Whether the bots play as characters from the table's cast, each with habits of its own and the name its theme
   * gives it. Off or missing means plain bots at the chosen level, named Bob, Carol and so on.
   */
  readonly personas?: boolean;
  /** Which table style supplies the characters' names. Defaults to the default theme. */
  readonly theme?: ThemeId;
  /** How fast the bots move. Defaults to "normal". Can be changed during the game. */
  readonly pace?: Pace;
  /** The seat that opens the game, 0 being the player. Omitted means a random seat. Used by tests. */
  readonly opener?: number;
  /** Makes dice and the bots deterministic. Used by tests. */
  readonly seed?: number;
}

export type SeatKind = "human" | "bot";

interface Seat {
  readonly name: string;
  readonly bot: Bot | null;
  readonly level: BotLevel | null;
}

/** A shuffled copy (Fisher-Yates). */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The two trays the dice move between. */
export type Tray = "visible" | "hidden";

/**
 * Everything the table draws from and asks of a game, with no `Game` in it: what the viewer may see (`view`) and the
 * things they can do. A local game implements it over the engine (`useSession`); an online one will implement it over
 * a connection, so the table never needs to know which it is talking to.
 */
export interface Session {
  /** What the viewer may see of the game, redacted as a server would send it. The table draws from this alone. */
  readonly view: SeatView;
  /** Who sits where: a seat is a human or a bot. */
  readonly seatKinds: readonly SeatKind[];
  isHuman(seat: number): boolean;
  readonly humanCount: number;
  /** The human whose screen this is. */
  readonly viewer: number;
  /** The seat the device must be handed to before the table shows, or null. */
  readonly handoff: number | null;
  acceptHandoff(): void;
  readonly log: readonly string[];
  readonly pulled: PullResult | null;
  readonly error: string | null;
  /** The visible tray as the player has arranged it, including dice dragged but not yet committed. */
  readonly visibleSet: ReadonlySet<number>;
  /** The seat of the bot about to move, or null. */
  readonly botSeat: number | null;
  readonly botTurn: boolean;
  /** When bots played at random levels: who played at which, to reveal at the end. Otherwise undefined. */
  readonly levelReveal: readonly { readonly name: string; readonly level: BotLevel }[] | undefined;
  readonly pace: Pace;
  setPace(pace: Pace): void;
  setPaused(paused: boolean): void;
  nextBotStep(): void;
  pullCup(): void;
  peer(): void;
  roll(which: DiceSet): void;
  peek(): void;
  claim(rank: Rank): void;
  moveDie(index: number, to: Tray): void;
  dismissPull(): void;
}

/**
 * The local session: a Session, plus the engine itself and each bot's level, for tests. The table is given only the
 * Session, so it cannot reach `game`.
 */
export type LocalSession = Session & { readonly game: Game; readonly botLevels: readonly BotLevel[] };

/**
 * One or more humans against bots, on this device. The engine is mutable, so each action ends by bumping a counter
 * to re-render. The UI reads the `view` and calls these actions.
 */
export function useSession(config: Config): LocalSession {
  const [{ game, core, botAt, kinds, botLevels }] = useState(() => {
    const rules = config.advanced ? advancedRules(config.lives) : basicRules(config.lives);
    const seeded = config.seed !== undefined;
    const humans = [config.name, ...(config.otherHumans ?? [])].slice(0, MAX_SEATS);
    const count = Math.min(
      Math.max(config.opponents ?? 1, humans.length === 1 ? 1 : 0),
      Math.min(BOT_NAMES.length, MAX_SEATS - humans.length),
    );
    // With characters, a table gets distinct archetypes drawn at random, each dressed by the theme.
    const archetypes = config.personas
      ? drawArchetypes(count, seeded ? seededRng(config.seed! + 700) : Math.random)
      : null;
    const botNames: readonly string[] = archetypes
      ? archetypes.map((a) => personaFor(config.theme ?? DEFAULT_THEME, a.id).name)
      : BOT_NAMES.slice(0, count);
    // With "random", every bot draws its own level, so a table can mix easy and stabby bots.
    const draw = seeded ? seededRng(config.seed! + 500) : Math.random;
    const levels: BotLevel[] = botNames.map(() =>
      config.level === "random" ? randomBotLevel(draw) : (config.level ?? "normal"),
    );
    const bots = levels.map(
      (level, i) =>
        new Bot({
          level,
          ...(archetypes ? { archetype: archetypes[i] } : {}),
          ...(seeded ? { rng: seededRng(config.seed! + 1 + i) } : {}),
        }),
    );
    // Humans first, then bots. A lone human keeps seat 0; with several, everyone is shuffled into random seats.
    const seats: Seat[] = [
      ...humans.map((name): Seat => ({ name, bot: null, level: null })),
      ...bots.map((bot, i): Seat => ({ name: botNames[i]!, bot, level: levels[i]! })),
    ];
    const order = humans.length > 1 ? shuffled(seats, seeded ? seededRng(config.seed! + 300) : Math.random) : seats;
    const game = new Game(
      order.map((seat) => seat.name),
      rules,
      seeded ? seededRng(config.seed!) : undefined,
      config.opener ?? "random",
    );
    return {
      game,
      // Every move, the player's and the bots', goes through the core, which is also what a server will run.
      core: new Core(game),
      botAt: order.map((seat) => seat.bot),
      kinds: order.map((seat): SeatKind => (seat.bot === null ? "human" : "bot")),
      // The level each bot is playing at, bot by bot in seat order.
      botLevels: order.flatMap((seat) => (seat.level === null ? [] : [seat.level])),
    };
  });
  const [tick, setTick] = useState(0);
  const [pace, setPace] = useState<Pace>(config.pace ?? "normal");
  /** Bots wait while this is true, e.g. while the rules are open. */
  const [paused, setPaused] = useState(false);
  const [log, setLog] = useState<readonly string[]>(() => [`${game.names[game.current]} opens the game`]);
  const [pulled, setPulled] = useState<PullResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Dice dragged into the visible tray this turn, committed when the player moves on. */
  const [draft, setDraft] = useState<ReadonlySet<number> | null>(null);

  const say = (line: string) => setLog((lines) => [...lines.slice(-19), line]);
  const refresh = () => setTick((n) => n + 1);

  const act = (fn: () => void) => {
    setError(null);
    try {
      fn();
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      setError(e.message);
    }
    refresh();
  };

  /** Sends an intent as the seat whose turn it is. The core's refusal becomes the RuleError that `act` shows. */
  const run = (intent: Intent): readonly GameEvent[] => {
    const res = core.apply(game.current, intent);
    if (!res.ok) throw new RuleError(res.error);
    return res.events;
  };

  const commitDraft = () => {
    if (draft !== null && game.available().includes("rearrange")) run({ action: "rearrange", visible: [...draft] });
    setDraft(null);
  };

  const isHuman = (seat: number) => kinds[seat] === "human";
  const humanCount = kinds.filter((kind) => kind === "human").length;
  /** The human who last had the device, once they have tapped through the handoff. */
  const [holder, setHolder] = useState<number | null>(null);

  /**
   * The human whose screen this is: whoever's turn it is, or, while bots play, the human who handed over to them
   * (the nearest one going back round the table, preferring anyone still in the game).
   */
  const viewer = (() => {
    const n = kinds.length;
    for (const stillIn of [true, false]) {
      for (let k = 0; k < n; k++) {
        const seat = (game.current - k + n) % n;
        if (isHuman(seat) && (!stillIn || game.lives[seat]! > 0)) return seat;
      }
    }
    return 0; // a table always has a human
  })();

  /**
   * The seat the device must be handed to before the table shows, or null. That is only when several humans share it,
   * it is a human's turn, and that human is not the one who last held the device. Bots' turns never need a handoff.
   */
  const handoff =
    humanCount > 1 && game.winner === null && pulled === null && isHuman(game.current) && holder !== game.current
      ? game.current
      : null;

  /** The seat of the bot about to move, or null when it's a human's turn or the game is over. */
  const botSeat = game.winner === null && !isHuman(game.current) && pulled === null ? game.current : null;

  /** Makes the bot's next visible move: pull, peer, rearrange, roll, or claim. */
  const botStep = () => {
    if (botSeat === null) return;
    const name = game.names[botSeat]!;
    const res = core.stepBot(botSeat, botAt[botSeat]!, (text) => say(`${name} ${text}`));
    if (res.ok && res.step.kind === "pulled") setPulled(res.step.result);
    refresh();
  };

  useEffect(() => {
    if (botSeat === null || pace === "step" || paused) return;
    const timer = setTimeout(botStep, botDelayMs(pace, game.step));
    return () => clearTimeout(timer);
  }, [botSeat, tick, pace, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleSet: ReadonlySet<number> = draft ?? game.visible;

  /** Whether this split leaves something the rules let the player roll. */
  const arrangementAllowed = (visible: ReadonlySet<number>) =>
    game.rules.rollOptional ||
    game.rules.rollable.some((which) => (which === "hidden" ? NUM_DICE - visible.size : visible.size) > 0);

  const levelReveal =
    config.level === "random"
      ? game.names.flatMap((name, i) => (kinds[i] === "bot" ? [name] : [])).map((name, i) => ({ name, level: botLevels[i]! }))
      : undefined;

  return {
    game,
    /** What the viewer may see; the table draws from this alone. */
    view: seatViewOf(game, viewer),
    levelReveal,
    /** The level each bot is actually playing at, bot by bot in seat order. */
    botLevels,
    seatKinds: kinds,
    isHuman,
    humanCount,
    viewer,
    handoff,
    /** The right person has the device: show the table. */
    acceptHandoff: () => setHolder(game.current),
    log,
    pulled,
    error,
    visibleSet,
    botSeat,
    botTurn: botSeat !== null,
    pace,
    setPace,
    setPaused,
    nextBotStep: botStep,

    pullCup: () =>
      act(() => {
        say(`${game.names[game.current]} pulls the cup`);
        const pull = run({ action: "pull" }).find((e) => e.type === "pulled");
        setPulled(pull as PullResult);
        setDraft(null);
      }),
    peer: () =>
      act(() => {
        run({ action: "peer" });
        say(`${game.names[game.current]} peers at the hidden dice`);
      }),
    roll: (which: DiceSet) =>
      act(() => {
        commitDraft();
        run({ action: "roll", set: which });
        say(`${game.names[game.current]} rolls ${rollPhrase(game.rules, which)}`);
        // Under basic rules the peek is compulsory straight after the roll, so there is nothing to choose and the roll
        // takes it. Advanced rules make it optional, so it stays a separate action.
        if (!game.rules.peekOptional) run({ action: "peek" });
      }),
    peek: () =>
      act(() => {
        commitDraft();
        run({ action: "peek" });
      }),
    claim: (rank: Rank) =>
      act(() => {
        commitDraft();
        const who = game.names[game.current]; // the turn passes on as soon as the claim is made
        run({ action: "claim", rank });
        say(`${who} claims ${formatRank(rank)}`);
      }),
    moveDie: (index: number, to: Tray) => {
      if (!isHuman(game.current) || !game.available().includes("rearrange")) return;
      const next = new Set(draft ?? game.visible);
      if (to === "visible") next.add(index);
      else next.delete(index);
      if (!arrangementAllowed(next)) {
        setError("Basic rules: leave at least one hidden die to roll.");
        return;
      }
      setError(null);
      setDraft(next);
    },
    dismissPull: () => setPulled(null),
  };
}
