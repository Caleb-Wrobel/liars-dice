/** Game state machine: rounds, turns, pulls and lives. */
import {
  FACES,
  NIL,
  NUM_DICE,
  TOP_RANK,
  compareRanks,
  evaluate,
  formatRank,
  isLegal,
  sameRank,
  type Rank,
} from "./ranks.ts";
import type { Rng } from "./rng.ts";

/** The attempted action is not allowed right now. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

export type DiceSet = "hidden" | "visible";

/** What a roll is called in a log. Basic rules only ever roll the one cup, so it just says "the cup". */
export function rollPhrase(rules: Pick<Rules, "rollable">, which: DiceSet): string {
  return rules.rollable.includes("visible") ? `the ${which} set` : "the cup";
}

/** Basic rules are the defaults. Advanced lifts restrictions, it adds none. */
export interface Rules {
  readonly lives: number;
  /** Which sets you may choose to roll. */
  readonly rollable: readonly DiceSet[];
  /** May you skip the roll? */
  readonly rollOptional: boolean;
  /** May you skip peeking after rolling? */
  readonly peekOptional: boolean;
}

export const basicRules = (lives = 3): Rules => ({
  lives,
  rollable: ["hidden"],
  rollOptional: false,
  peekOptional: false,
});

export const advancedRules = (lives = 3): Rules => ({
  lives,
  rollable: ["hidden", "visible"],
  rollOptional: true,
  peekOptional: true,
});

/** A turn's fixed order. You may skip ahead, never back. */
export const Step = {
  Decide: 0, // pull the cup, or peer
  Rearrange: 1, // move dice between the visible and hidden sets
  Roll: 2, // roll one of the sets
  Peek: 3, // peek at the hidden set
  Claim: 4, // claim strictly higher and pass
} as const;
export type Step = (typeof Step)[keyof typeof Step];

const STEP_NAMES: Record<Step, string> = {
  [Step.Decide]: "decide",
  [Step.Rearrange]: "rearrange",
  [Step.Roll]: "roll",
  [Step.Peek]: "peek",
  [Step.Claim]: "claim",
};

export type Action = "pull" | "peer" | "rearrange" | "roll" | "peek" | "claim";

export interface PullResult {
  readonly puller: number;
  readonly claimer: number;
  readonly claim: Rank;
  readonly dice: readonly number[];
  readonly revealed: Rank;
  readonly claimTrue: boolean;
  readonly loser: number;
  readonly eliminated: boolean;
}

const ALL_DICE: readonly number[] = Array.from({ length: NUM_DICE }, (_, i) => i);

export class Game {
  readonly names: readonly string[];
  readonly rules: Rules;
  readonly rng: Rng;
  lives: number[];

  // Round and turn state, reset by startRound().
  current!: number;
  dice!: number[];
  visible!: ReadonlySet<number>;
  /** The dice the current player has seen. */
  known!: ReadonlySet<number>;
  claim!: Rank;
  claimer!: number | null;
  rolled!: boolean;
  peeked!: boolean;
  step!: Step;

  /**
   * `first` is the seat that opens the game, or "random" to draw one from `rng` (so a seeded game always opens
   * the same way). It defaults to seat 0.
   */
  constructor(
    names: readonly string[],
    rules: Rules = basicRules(),
    rng: Rng = Math.random,
    first: number | "random" = 0,
  ) {
    if (names.length < 2) throw new Error("need at least two players");
    this.names = [...names];
    this.rules = rules;
    this.rng = rng;
    this.lives = names.map(() => rules.lives);
    this.startRound(first === "random" ? Math.floor(this.rng() * names.length) : first);
  }

  // --- queries -------------------------------------------------------------

  get winner(): number | null {
    const alive = this.lives.flatMap((n, i) => (n > 0 ? [i] : []));
    return alive.length === 1 ? alive[0]! : null;
  }

  /** Nothing can outrank the top claim, so peering would strand you. */
  get canPeer(): boolean {
    return !sameRank(this.claim, NIL) && !sameRank(this.claim, TOP_RANK);
  }

  get visibleFaces(): number[] {
    return [...this.visible].sort((a, b) => a - b).map((i) => this.dice[i]!);
  }

  nextAlive(index: number): number {
    const n = this.names.length;
    for (let step = 1; step <= n; step++) {
      const candidate = (index + step) % n;
      if (this.lives[candidate]! > 0) return candidate;
    }
    throw new RuleError("no players left");
  }

  /** Actions the current player may take right now. */
  available(): Action[] {
    if (this.step === Step.Decide) return this.canPeer ? ["pull", "peer"] : ["pull"];
    const actions: Action[] = [];
    if (this.step <= Step.Rearrange) actions.push("rearrange");
    if (this.step <= Step.Roll) actions.push("roll");
    if (this.step <= Step.Peek && this.rollSatisfied()) actions.push("peek");
    if (this.claimUnlocked()) actions.push("claim");
    return actions;
  }

  // --- round and turn actions ----------------------------------------------

  /**
   * All five dice start hidden and unseen, with nothing to beat.
   *
   * The opener begins at the roll step: their sets are empty so there is
   * nothing to rearrange, and nothing to pull.
   */
  startRound(opener: number): void {
    this.current = opener;
    this.dice = Array.from({ length: NUM_DICE }, () => this.rollDie());
    this.visible = new Set();
    this.known = new Set();
    this.claim = NIL;
    this.claimer = null;
    this.rolled = false;
    this.peeked = false;
    this.step = Step.Roll;
  }

  /** Pull the cup. The next round opens with the player after the puller. */
  pull(): PullResult {
    if (this.step !== Step.Decide) throw new RuleError("you can only pull at the start of your turn");
    const puller = this.current;
    const claimer = this.claimer!;
    const claim = this.claim;
    const revealed = evaluate(this.dice);
    const claimTrue = compareRanks(revealed, claim) >= 0;
    const loser = claimTrue ? puller : claimer;
    this.lives[loser]! -= 1;
    const result: PullResult = {
      puller,
      claimer,
      claim,
      dice: [...this.dice],
      revealed,
      claimTrue,
      loser,
      eliminated: this.lives[loser] === 0,
    };
    if (this.winner === null) this.startRound(this.nextAlive(puller));
    return result;
  }

  /** See the hidden dice. This commits you to claiming higher. */
  peer(): number[] {
    if (this.step !== Step.Decide) throw new RuleError("you can only peer at the start of your turn");
    if (!this.canPeer) throw new RuleError("the top rank is claimed; you must pull");
    this.known = new Set(ALL_DICE);
    this.step = Step.Rearrange;
    return [...this.dice];
  }

  rearrange(visible: Iterable<number>): void {
    this.begin(Step.Rearrange);
    const chosen = new Set(visible);
    for (const i of chosen) {
      if (!Number.isInteger(i) || i < 0 || i >= NUM_DICE) throw new RuleError("dice are numbered 0-4");
    }
    const hidden = new Set(ALL_DICE.filter((i) => !chosen.has(i)));
    const sets: Record<DiceSet, ReadonlySet<number>> = { hidden, visible: chosen };
    if (!this.rules.rollOptional && !this.rules.rollable.some((w) => sets[w].size > 0)) {
      throw new RuleError("you must leave a set you are able to roll");
    }
    this.visible = chosen;
    this.step = Step.Roll;
  }

  /**
   * Roll the hidden or visible set.
   *
   * Rolling an empty set is the same as electing not to roll, so it is only
   * allowed when rolling is optional.
   */
  roll(which: DiceSet = "hidden"): void {
    this.begin(Step.Roll);
    if (!this.rules.rollable.includes(which)) throw new RuleError(`you may not roll the ${which} dice`);
    const rolled =
      which === "visible" ? [...this.visible] : ALL_DICE.filter((i) => !this.visible.has(i));
    if (rolled.length === 0 && !this.rules.rollOptional) {
      throw new RuleError("the set is empty, and you must roll");
    }
    for (const i of rolled) this.dice[i] = this.rollDie();
    if (which === "hidden") {
      // You haven't seen the new faces yet.
      this.known = new Set([...this.known].filter((i) => !rolled.includes(i)));
    }
    this.rolled = rolled.length > 0;
    this.step = Step.Peek;
  }

  peek(): number[] {
    this.begin(Step.Peek);
    // Skipping ahead would strand the player: the roll could no longer be made.
    if (!this.rollSatisfied()) throw new RuleError("you must roll before you peek");
    this.known = new Set(ALL_DICE);
    this.peeked = true;
    this.step = Step.Claim;
    return [...this.dice];
  }

  /** Claim any rank strictly above the standing one, true or not. */
  makeClaim(claim: Rank): void {
    this.begin(Step.Claim);
    if (!this.claimUnlocked()) throw new RuleError("you must roll and peek before claiming");
    if (!isLegal(claim)) throw new RuleError("not a valid claim");
    if (compareRanks(claim, this.claim) <= 0) {
      throw new RuleError(`you must beat ${formatRank(this.claim)}`);
    }
    this.claim = claim;
    this.claimer = this.current;
    this.current = this.nextAlive(this.current);
    this.known = this.visible; // the next player sees only the visible dice
    this.rolled = false;
    this.peeked = false;
    this.step = Step.Decide;
  }

  // --- internals -----------------------------------------------------------

  private rollDie(): number {
    return FACES[Math.floor(this.rng() * FACES.length)]!;
  }

  private rollSatisfied(): boolean {
    return this.rolled || this.rules.rollOptional;
  }

  private claimUnlocked(): boolean {
    if (this.step === Step.Decide) return false;
    return (this.rolled || this.rules.rollOptional) && (this.peeked || this.rules.peekOptional);
  }

  private begin(step: Step): void {
    if (this.step === Step.Decide) throw new RuleError("pull or peer first");
    if (this.step > step) {
      throw new RuleError(`too late to ${STEP_NAMES[step]}: the turn order is fixed`);
    }
  }
}
