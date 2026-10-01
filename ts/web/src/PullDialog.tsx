import { formatRank, type PullResult } from "@liars-dice/engine";
import { Die } from "./Die.tsx";

const LABELS = "abcde";

/** Shown after a pull: everything is revealed and a life is lost. */
export function PullDialog({
  result,
  names,
  final,
  onContinue,
  onRematch,
  onQuit,
}: {
  result: PullResult;
  names: readonly string[];
  /** The game is over: offer a rematch instead of the next round. */
  final: boolean;
  onContinue: () => void;
  onRematch: () => void;
  onQuit: () => void;
}) {
  const name = (i: number) => names[i]!;
  return (
    <div className="backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="pull-title" className="dialog">
        <h2 id="pull-title">{name(result.puller)} lifts the cup</h2>
        <div className="dice-row">
          {result.dice.map((face, i) => (
            <Die key={i} face={face} label={LABELS[i]!} />
          ))}
        </div>
        <p>
          The dice make <strong>{formatRank(result.revealed)}</strong>.
        </p>
        <p>
          {name(result.claimer)} claimed <strong>{formatRank(result.claim)}</strong>:{" "}
          <strong className={result.claimTrue ? "ok" : "bad"}>{result.claimTrue ? "true" : "a bluff"}</strong>.
        </p>
        <p>
          {name(result.loser)} loses a life{result.eliminated ? " and is out!" : "."}
        </p>
        {final ? (
          <div className="dialog-buttons">
            <button type="button" className="primary" autoFocus onClick={onRematch}>
              Play again
            </button>
            <button type="button" onClick={onQuit}>
              Change settings
            </button>
          </div>
        ) : (
          <button type="button" className="primary" autoFocus onClick={onContinue}>
            Next round
          </button>
        )}
      </div>
    </div>
  );
}
