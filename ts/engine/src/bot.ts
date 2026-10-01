/**
 * A simple computer opponent.
 *
 * The bot only uses what its seat may know: the visible dice, the standing claim,
 * and its own dice once it has peered or peeked. It never reads hidden dice it
 * hasn't seen.
 */
import { Game, Step, type PullResult } from "./game.ts";
import {
  FACES,
  LADDER,
  NUM_DICE,
  compareRanks,
  evaluate,
  formatRank,
  sameRank,
  type Rank,
} from "./ranks.ts";
import type { Rng } from "./rng.ts";

const SAMPLES = 200;
const ALL_DICE: readonly number[] = Array.from({ length: NUM_DICE }, (_, i) => i);

export interface BotOptions {
  readonly rng?: Rng;
  /** Pull when the claim looks less likely than this. */
  readonly pullBelow?: number;
}

export class Bot {
  readonly rng: Rng;
  readonly pullBelow: number;

  constructor({ rng = Math.random, pullBelow = 0.35 }: BotOptions = {}) {
    this.rng = rng;
    this.pullBelow = pullBelow;
  }

  /** Estimate how likely the standing claim is, given only the visible dice. */
  chanceTrue(game: Game): number {
    const visible = [...game.visible].map((i) => game.dice[i]!);
    const unseen = NUM_DICE - visible.length;
    let hits = 0;
    for (let n = 0; n < SAMPLES; n++) {
      const dice = [...visible, ...Array.from({ length: unseen }, () => this.rollDie())];
      if (compareRanks(evaluate(dice), game.claim) >= 0) hits++;
    }
    return hits / SAMPLES;
  }

  /**
   * Take a whole turn. Returns the result if the bot pulled the cup.
   * `say` receives public narration only, never the bot's dice.
   */
  play(game: Game, say: (text: string) => void = () => {}): PullResult | null {
    if (game.step === Step.Decide) {
      const noise = this.rng() * 0.2 - 0.1;
      const doubt = this.chanceTrue(game) < this.pullBelow + noise;
      if (!game.available().includes("peer") || doubt) {
        say("pulls the cup");
        return game.pull();
      }
      game.peer();
      say("peers at the hidden dice");
    }

    if (game.available().includes("rearrange") && this.rng() < 0.5) {
      game.rearrange(this.sample(ALL_DICE, this.rng() < 0.5 ? 1 : 2));
      say(`rearranges the sets, showing ${game.visibleFaces.join(" ")}`);
    }

    const keepHand =
      game.rules.rollOptional &&
      game.known.size === NUM_DICE &&
      compareRanks(evaluate(game.dice), game.claim) > 0;
    if (game.available().includes("roll") && !keepHand) {
      game.roll("hidden");
      say("rolls the hidden set");
    } else {
      say("keeps the dice as they are");
    }
    if (game.available().includes("peek")) game.peek();

    const claim = this.chooseClaim(game);
    game.makeClaim(claim);
    say(`claims ${formatRank(claim)}`);
    return null;
  }

  /** Claim near the real rank if it beats the standing claim, else bluff upward. */
  chooseClaim(game: Game): Rank {
    const standing = LADDER.findIndex((r) => sameRank(r, game.claim)); // -1 for nil
    const actual = LADDER.findIndex((r) => sameRank(r, evaluate(game.dice)));
    const target =
      actual > standing
        ? Math.max(standing + 1, actual - this.pick([0, 0, 1, 2, 3]))
        : Math.min(standing + this.pick([1, 1, 2, 3, 5]), LADDER.length - 1);
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
