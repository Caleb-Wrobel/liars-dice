import {
  Bot,
  Game,
  NUM_DICE,
  RuleError,
  advancedRules,
  basicRules,
  formatRank,
  randomBotLevel,
  seededRng,
  type BotLevel,
  type DiceSet,
  type PullResult,
  type Rank,
} from "@liars-dice/engine";
import { useEffect, useState } from "react";

export const HUMAN = 0;

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
  readonly lives: number;
  readonly advanced: boolean;
  /** How many bots sit at the table, 1 to 5. Defaults to 1. */
  readonly opponents?: number;
  /** How the bots play. Defaults to "normal". */
  readonly level?: LevelChoice;
  /** How fast the bots move. Defaults to "normal". Can be changed during the game. */
  readonly pace?: Pace;
  /** Makes dice and the bots deterministic. Used by tests. */
  readonly seed?: number;
}

/** The two trays the dice move between. */
export type Tray = "visible" | "hidden";

/**
 * One human against one or more bots. The engine is mutable, so each action ends by bumping a
 * counter to re-render. The UI only reads the engine and calls these actions.
 */
export function useSession(config: Config) {
  const [{ game, bots, levels }] = useState(() => {
    const rules = config.advanced ? advancedRules(config.lives) : basicRules(config.lives);
    const seeded = config.seed !== undefined;
    const count = Math.min(Math.max(config.opponents ?? 1, 1), BOT_NAMES.length);
    const seats = BOT_NAMES.slice(0, count);
    // With "random", every bot draws its own level, so a table can mix easy and stabby bots.
    const draw = seeded ? seededRng(config.seed! + 500) : Math.random;
    const levels: BotLevel[] = seats.map(() =>
      config.level === "random" ? randomBotLevel(draw) : (config.level ?? "normal"),
    );
    return {
      game: new Game([config.name, ...seats], rules, seeded ? seededRng(config.seed!) : undefined),
      // bots[i] sits in seat i + 1
      bots: levels.map((level, i) => new Bot({ level, ...(seeded ? { rng: seededRng(config.seed! + 1 + i) } : {}) })),
      levels,
    };
  });
  const [tick, setTick] = useState(0);
  const [pace, setPace] = useState<Pace>(config.pace ?? "normal");
  /** Bots wait while this is true, e.g. while the rules are open. */
  const [paused, setPaused] = useState(false);
  const [log, setLog] = useState<readonly string[]>([]);
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

  /** The seat of the bot about to move, or null when it's the human's turn or the game is over. */
  const botSeat = game.winner === null && game.current !== HUMAN && pulled === null ? game.current : null;

  /** Makes the bot's next visible move: pull, peer, rearrange, roll, or claim. */
  const botStep = () => {
    if (botSeat === null) return;
    const name = game.names[botSeat]!;
    const outcome = bots[botSeat - 1]!.step(game, (text) => say(`${name} ${text}`));
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
    name: config.name,
    log,
    pulled,
    error,
    visibleSet,
    botSeat,
    botTurn: botSeat !== null,
    /** The level each bot is actually playing at, seat by seat after yours. */
    botLevels: levels,
    pace,
    setPace,
    setPaused,
    nextBotStep: botStep,

    pullCup: () =>
      act(() => {
        say(`${config.name} pulls the cup`);
        setPulled(game.pull());
        setDraft(null);
      }),
    peer: () =>
      act(() => {
        game.peer();
        say(`${config.name} peers at the hidden dice`);
      }),
    roll: (which: DiceSet) =>
      act(() => {
        commitDraft();
        game.roll(which);
        say(`${config.name} rolls the ${which} set`);
      }),
    peek: () =>
      act(() => {
        commitDraft();
        game.peek();
      }),
    claim: (rank: Rank) =>
      act(() => {
        commitDraft();
        game.makeClaim(rank);
        say(`${config.name} claims ${formatRank(rank)}`);
      }),
    moveDie: (index: number, to: Tray) => {
      if (game.current !== HUMAN || !game.available().includes("rearrange")) return;
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
