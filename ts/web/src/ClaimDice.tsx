import { rankDice, type Rank } from "@liars-dice/engine";
import { Die } from "./Die.tsx";

/** A claim drawn as dice, e.g. "a pair of 3s and a 5" is 3, 3 and a dashed 5 for the kicker. */
export function ClaimDice({ rank }: { rank: Rank }) {
  const dice = rankDice(rank);
  if (dice.length === 0) return null;
  const kickerAt = rank.kicker > 0 ? dice.length - 1 : -1;
  return (
    <div className="claim-dice" role="group" aria-label={`Claimed dice: ${dice.join(", ")}`}>
      {dice.map((face, i) => (
        <Die key={i} face={face} label="claimed" kicker={i === kickerAt} />
      ))}
    </div>
  );
}
