import {
  Bot,
  Game,
  NUM_DICE,
  RuleError,
  advancedRules,
  basicRules,
  drawArchetypes,
  formatRank,
  rollPhrase,
  randomBotLevel,
  seededRng,
  type BotLevel,
  type DiceSet,
  type PullResult,
  type Rank,
} from "@liars-dice/engine";
import { useEffect, useState } from "react";
import { personaFor } from "./personas/index.ts";
import { DEFAULT_THEME, type ThemeId } from "./theme.ts";

/** The player's seat when playing alone against bots. With several humans, seats are shuffled; ask `isHuman`. */
export const HUMAN = 0;
/** A table seats 2 to 6, humans and bots together. */
export const MAX_SEATS = 6;

/** How fast the bots move. "step" waits for you to press Next move after each action. */
export type Pace = "fast" | "normal" | "slow" | "step";
export const PACES: readonly Pace[] = ["fast", "normal", "slow", "step"];
/** Pause before each bot action, in milliseconds. */
export const PACE_MS = { fast: 250, normal: 700, slow: 1600 } as const;
/** Opponents are seated after the human, in this order. */
export const BOT_NAMES = ["Bob", "Carol", "Dave", "Eve", "Frank"] as const;

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
 * One human against one or more bots. The engine is mutable, so each action ends by bumping a
 * counter to re-render. The UI only reads the engine and calls these actions.
 */
export function useSession(config: Config) {
  const [{ game, botAt, kinds, botLevels }] = useState(() => {
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
    return {
      game: new Game(
        order.map((seat) => seat.name),
        rules,
        seeded ? seededRng(config.seed!) : undefined,
        config.opener ?? "random",
      ),
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

  const commitDraft = () => {
    if (draft !== null && game.available().includes("rearrange")) game.rearrange(draft);
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
    const outcome = botAt[botSeat]!.step(game, (text) => say(`${name} ${text}`));
    if (outcome.kind === "pulled") setPulled(outcome.result);
    refresh();
  };

  useEffect(() => {
    if (botSeat === null || pace === "step" || paused) return;
    const timer = setTimeout(botStep, PACE_MS[pace]);
    return () => clearTimeout(timer);
  }, [botSeat, tick, pace, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleSet: ReadonlySet<number> = draft ?? game.visible;

  /** Whether this split leaves something the rules let the player roll. */
  const arrangementAllowed = (visible: ReadonlySet<number>) =>
    game.rules.rollOptional ||
    game.rules.rollable.some((which) => (which === "hidden" ? NUM_DICE - visible.size : visible.size) > 0);

  return {
    game,
    /** Who sits where: a seat is a human or a bot. */
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
    /** The level each bot is actually playing at, bot by bot in seat order. */
    botLevels,
    pace,
    setPace,
    setPaused,
    nextBotStep: botStep,

    pullCup: () =>
      act(() => {
        say(`${game.names[game.current]} pulls the cup`);
        setPulled(game.pull());
        setDraft(null);
      }),
    peer: () =>
      act(() => {
        game.peer();
        say(`${game.names[game.current]} peers at the hidden dice`);
      }),
    roll: (which: DiceSet) =>
      act(() => {
        commitDraft();
        game.roll(which);
        say(`${game.names[game.current]} rolls ${rollPhrase(game.rules, which)}`);
        // Under basic rules the peek is compulsory straight after the roll, so there is nothing to choose and the roll
        // takes it. Advanced rules make it optional, so it stays a separate action.
        if (!game.rules.peekOptional) game.peek();
      }),
    peek: () =>
      act(() => {
        commitDraft();
        game.peek();
      }),
    claim: (rank: Rank) =>
      act(() => {
        commitDraft();
        const who = game.names[game.current]; // the turn passes on as soon as the claim is made
        game.makeClaim(rank);
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
