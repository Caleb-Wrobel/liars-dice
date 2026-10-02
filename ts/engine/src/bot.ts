/**
 * A simple computer opponent.
 *
 * The bot only uses what its seat may know: the visible dice, the standing claim,
 * and its own dice once it has peered or peeked. It never reads hidden dice it
 * hasn't seen.
 */
import { Game, Step, rollPhrase, type PullResult } from "./game.ts";
import type { Archetype, Habits } from "./archetype.ts";
import {
  FACES,
  LADDER,
  NIL,
  NUM_DICE,
  compareRanks,
  evaluate,
  formatRank,
  sameRank,
  type Rank,
} from "./ranks.ts";
import type { Rng } from "./rng.ts";

const ALL_DICE: readonly number[] = Array.from({ length: NUM_DICE }, (_, i) => i);

/** The numbers that make one bot play differently from another. */
export interface BotStyle {
  /** Pull when the standing claim looks less likely than this. */
  readonly pullBelow: number;
  /** Random wobble (plus or minus) on that threshold, so the bot isn't predictable. */
  readonly noise: number;
  /** Dice simulations per estimate. Fewer means a rougher read of the claim. */
  readonly samples: number;
  /** How many rungs below its real rank it may claim, chosen at random. */
  readonly sandbag: readonly number[];
  /** How many rungs above the standing claim it bluffs, chosen at random. */
  readonly bluff: readonly number[];
}

/**
 * Levels are ordered by strength. In this game claims tend to be close to the truth, so the
 * main lever is patience: pulling on a shaky claim usually loses a life, and the strongest
 * play is to let a claim climb until it really stops being believable, then pull.
 */
export const BOT_LEVELS = {
  /** Jumpy: pulls on shaky claims, reads the odds roughly, and is often wrong. */
  easy: { pullBelow: 0.5, noise: 0.15, samples: 40, sandbag: [0, 0, 0, 1], bluff: [1, 1, 2] },
  /** A balanced opponent. */
  normal: { pullBelow: 0.25, noise: 0.1, samples: 200, sandbag: [0, 0, 1, 2, 3], bluff: [1, 1, 2, 3, 5] },
  /** Patient: hides its strength, lets you climb, then stabs when your claim stops being believable. */
  stabby: { pullBelow: 0.08, noise: 0.05, samples: 400, sandbag: [0, 1, 2, 3, 4], bluff: [1, 2, 3, 5] },
} as const satisfies Record<string, BotStyle>;

export type BotLevel = keyof typeof BOT_LEVELS;
export const BOT_LEVEL_NAMES = Object.keys(BOT_LEVELS) as BotLevel[];

/** A level picked at random, each equally likely. */
export function randomBotLevel(rng: Rng = Math.random): BotLevel {
  return BOT_LEVEL_NAMES[Math.floor(rng() * BOT_LEVEL_NAMES.length)]!;
}

export interface BotOptions {
  readonly rng?: Rng;
  /** Defaults to "normal". */
  readonly level?: BotLevel;
  /** Overrides the level's pull threshold. */
  readonly pullBelow?: number;
  /** Habits that give the bot character, without changing how strong it is. */
  readonly archetype?: Archetype;
}

/** What one step of a bot's turn did. */
export type BotStep =
  | { readonly kind: "acted" } // made a move; the turn continues
  | { readonly kind: "claimed" } // made its claim, ending the turn
  | { readonly kind: "pulled"; readonly result: PullResult }; // pulled the cup, ending the round

export class Bot {
  readonly rng: Rng;
  readonly level: BotLevel;
  readonly style: BotStyle;
  readonly archetype: Archetype | null;
  private readonly habits: Habits;
  /** Where the bot is in its current turn. */
  private phase: "start" | "arrange" | "roll" | "peek" | "claim" = "start";

  constructor({ rng = Math.random, level = "normal", pullBelow, archetype }: BotOptions = {}) {
    this.rng = rng;
    this.level = level;
    this.archetype = archetype ?? null;
    this.habits = archetype?.habits ?? {};
    const base: BotStyle = pullBelow === undefined ? BOT_LEVELS[level] : { ...BOT_LEVELS[level], pullBelow };
    this.style = {
      ...base,
      ...(this.habits.bluff ? { bluff: this.habits.bluff } : {}),
      ...(this.habits.sandbag ? { sandbag: this.habits.sandbag } : {}),
    };
  }

  /** Estimate how likely the standing claim is, given only the visible dice. */
  chanceTrue(game: Game): number {
    const visible = [...game.visible].map((i) => game.dice[i]!);
    const unseen = NUM_DICE - visible.length;
    let hits = 0;
    for (let n = 0; n < this.style.samples; n++) {
      const dice = [...visible, ...Array.from({ length: unseen }, () => this.rollDie())];
      if (compareRanks(evaluate(dice), game.claim) >= 0) hits++;
    }
    return hits / this.style.samples;
  }

  /**
   * Take a whole turn. Returns the result if the bot pulled the cup.
   * `say` receives public narration only, never the bot's dice.
   */
  play(game: Game, say: (text: string) => void = () => {}): PullResult | null {
    for (;;) {
      const outcome = this.step(game, say);
      if (outcome.kind === "pulled") return outcome.result;
      if (outcome.kind === "claimed") return null;
    }
  }

  /**
   * Take the bot's next visible move: pull, peer, rearrange, roll (or keep the dice), or claim.
   * Moves nobody could see, like skipping the rearrange or the bot's own peek, are folded into the
   * next visible one, so a caller can pause between steps to let a person follow along.
   * `say` receives public narration only, never the bot's dice.
   */
  step(game: Game, say: (text: string) => void = () => {}): BotStep {
    for (;;) {
      switch (this.phase) {
        case "start": {
          if (game.step !== Step.Decide) {
            this.phase = "roll"; // the opener has nothing to pull and nothing to rearrange
            break;
          }
          const noise = (this.rng() * 2 - 1) * this.style.noise;
          const doubt = this.chanceTrue(game) < this.style.pullBelow + noise;
          if (!game.available().includes("peer") || doubt) {
            say("pulls the cup");
            return { kind: "pulled", result: game.pull() };
          }
          game.peer();
          say("peers at the hidden dice");
          this.phase = "arrange";
          return { kind: "acted" };
        }
        case "arrange": {
          this.phase = "roll";
          if (game.available().includes("rearrange") && this.rng() < (this.habits.rearrange ?? 0.5)) {
            game.rearrange(this.sample(ALL_DICE, this.rng() < 0.5 ? 1 : 2));
            say(`rearranges the sets, showing ${game.visibleFaces.join(" ")}`);
            return { kind: "acted" };
          }
          break;
        }
        case "roll": {
          this.phase = "peek";
          const keepHand =
            game.rules.rollOptional &&
            game.known.size === NUM_DICE &&
            compareRanks(evaluate(game.dice), game.claim) > 0;
          // A gambler sometimes keeps the dice it has even though they won't beat the claim.
          const gamble =
            !keepHand &&
            game.rules.rollOptional &&
            this.habits.gambleRoll !== undefined &&
            this.rng() < this.habits.gambleRoll;
          if (game.available().includes("roll") && !keepHand && !gamble) {
            game.roll("hidden");
            say(`rolls ${rollPhrase(game.rules, "hidden")}`);
          } else {
            say("keeps the dice as they are");
          }
          return { kind: "acted" };
        }
        case "peek": {
          this.phase = "claim";
          // A reckless bot may claim without looking. Nobody opens blind: there is no claim to size up.
          const blind =
            game.rules.peekOptional &&
            this.habits.blindClaim !== undefined &&
            !sameRank(game.claim, NIL) &&
            this.rng() < this.habits.blindClaim;
          if (!blind && game.available().includes("peek")) game.peek();
          break;
        }
        case "claim": {
          this.phase = "start";
          const claim = this.chooseClaim(game);
          game.makeClaim(claim);
          say(`claims ${formatRank(claim)}`);
          return { kind: "claimed" };
        }
      }
    }
  }

  /**
   * Claim near the real rank if the bot can see its dice and they beat the standing claim, else
   * bluff upward. A bot that has not looked at its dice never uses them.
   */
  chooseClaim(game: Game): Rank {
    const standing = LADDER.findIndex((r) => sameRank(r, game.claim)); // -1 for nil
    const knowsDice = game.known.size === NUM_DICE;
    const actual = knowsDice ? LADDER.findIndex((r) => sameRank(r, evaluate(game.dice))) : -1;
    const target =
      knowsDice && actual > standing
        ? Math.max(standing + 1, actual - this.pick(this.style.sandbag))
        : Math.min(standing + this.pick(this.style.bluff), LADDER.length - 1);
    return LADDER[target]!;
  }

  private rollDie(): number {
    return FACES[Math.floor(this.rng() * FACES.length)]!;
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rng() * items.length)]!;
  }

  /** `count` distinct items, chosen without replacement. */
  private sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const chosen: T[] = [];
    while (chosen.length < count && pool.length > 0) {
      chosen.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]!);
    }
    return chosen;
  }
}
