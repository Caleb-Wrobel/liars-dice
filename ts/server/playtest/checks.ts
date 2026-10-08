import { NUM_DICE, type SeatView } from "@liars-dice/engine";

/** Exactly what a view holds. A field that appears here later is a decision, not an accident, so the run objects. */
export const VIEW_KEYS = [
  "available", "claim", "claimer", "current", "dice", "lives", "names", "rules", "step", "visible", "winner", "you",
] as const;

/**
 * What is wrong with a view that a seat was sent, as sentences (empty when nothing is). `seat` is the seat this player
 * was dealt, once known. Nothing here asks the engine what is legal; it only holds the server to what a view promises:
 * it is for this seat, it has no field it should not, and a die this seat may not see is not there.
 */
export function viewProblems(view: SeatView, seat: number | undefined): string[] {
  const problems: string[] = [];
  const keys = Object.keys(view).sort();
  if (keys.join() !== [...VIEW_KEYS].sort().join()) problems.push(`the view has the wrong fields: ${keys.join(", ")}`);
  if (seat !== undefined && view.you !== seat) problems.push(`a view for seat ${view.you} reached seat ${seat}`);
  if (view.dice.length !== NUM_DICE) problems.push(`the view shows ${view.dice.length} dice`);
  const mine = view.current === view.you;
  view.dice.forEach((face, i) => {
    if (face === null) return;
    if (!Number.isInteger(face) || face < 1 || face > 6) problems.push(`die ${i} shows ${String(face)}`);
    else if (!view.visible.includes(i) && !mine) problems.push(`die ${i} is hidden but shows ${face} to a seat that is not on turn`);
  });
  if (view.lives.length !== view.names.length) problems.push("lives and names differ in length");
  if (view.available.length > 0 && (!mine || view.winner !== null)) problems.push("moves are open to a seat that cannot move");
  if (view.winner !== null) {
    const alive = view.lives.flatMap((l, i) => (l > 0 ? [i] : []));
    if (alive.length !== 1 || alive[0] !== view.winner) problems.push(`the winner is ${view.winner} but ${alive.join() || "nobody"} has lives`);
  }
  return problems;
}

/** Lives only ever fall. A view that gives one back is wrong, or stale in a way a resume should never produce. */
export function livesProblems(before: SeatView | undefined, after: SeatView): string[] {
  if (before === undefined) return [];
  return after.lives.flatMap((l, i) => (l > (before.lives[i] ?? 0) ? [`seat ${i} went from ${before.lives[i]} lives to ${l}`] : []));
}

/** What every seat must agree on when a game is over. */
export function agreementProblems(views: readonly SeatView[]): string[] {
  const [first, ...rest] = views;
  if (first === undefined) return [];
  const same = (v: SeatView) => JSON.stringify([v.names, v.lives, v.winner, v.claim, v.claimer]);
  return rest.flatMap((v) => (same(v) === same(first) ? [] : [`seat ${v.you} and seat ${first.you} ended with different tables`]));
}

/** Names of the secrets (by whose they are) found in a message that was not theirs to read. */
export function leaked(raw: string, secrets: ReadonlyMap<string, string>): string[] {
  return [...secrets].filter(([, secret]) => secret !== "" && raw.includes(secret)).map(([whose]) => whose);
}
