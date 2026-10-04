/**
 * What one seat is allowed to see of a game.
 *
 * `Game` holds every die, so handing a Game to a player hands them every secret. A view is the only thing a seat is
 * ever sent: the public state, plus the faces of hidden dice that seat has legitimately looked at. It is plain data
 * (numbers, strings, arrays and objects of them), so it survives JSON, and it copies everything it reads, so a caller
 * can never reach back into the game through it. The RNG and the raw dice array are never part of it.
 *
 * This is the one place a bug is a cheating bug. See docs/multiplayer.md ("What a seat may see").
 */
import { type Action, type Game, type Rules, type Step } from "./game.ts";
import { type Rank } from "./ranks.ts";

export interface SeatView {
  /** The seat this view was made for. */
  readonly you: number;
  readonly names: readonly string[];
  readonly lives: readonly number[];
  /** Whose turn it is. */
  readonly current: number;
  readonly step: Step;
  /** The standing claim, and who made it (null while there is nothing to beat). */
  readonly claim: Rank;
  readonly claimer: number | null;
  readonly rules: Rules;
  /**
   * One entry per die. A face where this seat may see it, null where it may not: a die in the visible set shows
   * its face to everyone, and a hidden die shows it only to the current player, and only once they have seen it.
   */
  readonly dice: readonly (number | null)[];
  /** Indices of the dice in the visible set. */
  readonly visible: readonly number[];
  /** The actions open to this seat right now: empty unless it is their turn, and the game is not over. */
  readonly available: readonly Action[];
  readonly winner: number | null;
}

export function view(game: Game, seat: number): SeatView {
  if (!Number.isInteger(seat) || seat < 0 || seat >= game.names.length) {
    throw new RangeError(`there is no seat ${seat}`);
  }
  const mine = seat === game.current;
  const winner = game.winner;
  return {
    you: seat,
    names: [...game.names],
    lives: [...game.lives],
    current: game.current,
    step: game.step,
    claim: { category: game.claim.category, faces: [...game.claim.faces], kicker: game.claim.kicker },
    claimer: game.claimer,
    rules: { ...game.rules, rollable: [...game.rules.rollable] },
    // `known` is the current player's, so it counts for nobody else.
    dice: game.dice.map((face, i) => (game.visible.has(i) || (mine && game.known.has(i)) ? face : null)),
    visible: [...game.visible].sort((a, b) => a - b),
    available: mine && winner === null ? game.available() : [],
    winner,
  };
}
