import {
  CATEGORY_LABELS,
  Category,
  FACES,
  compareRanks,
  definingFaceCount,
  formatRank,
  hasKicker,
  isLegal,
  nextRank,
  rank,
  type Rank,
} from "@liars-dice/engine";
import { useState } from "react";

const FACE_LABELS: Partial<Record<Category, readonly string[]>> = {
  [Category.TwoPair]: ["High pair", "Low pair"],
  [Category.FullHouse]: ["Three of", "Pair of"],
};

/** Faces that are valid for the category, carrying over what the player already chose. */
function fitFaces(category: Category, previous: readonly number[]): number[] {
  const size = definingFaceCount(category);
  if (size === 0) return [];
  if (size === 1) return [previous[0] ?? 1];
  return [Math.max(previous[0] ?? 2, 2), 1]; // two pair and full house both accept (n>1, 1)
}

/** Builds a claim from selects. Starts on the smallest legal raise. */
export function ClaimPicker({ standing, onClaim }: { standing: Rank; onClaim: (r: Rank) => void }) {
  const smallest = nextRank(standing);
  const [category, setCategory] = useState<Category>(smallest?.category ?? Category.FiveKind);
  const [faces, setFaces] = useState<number[]>([...(smallest?.faces ?? [6])]);
  const [kicker, setKicker] = useState(smallest?.kicker ?? 0);

  const candidate = rank(category, faces, hasKicker(category) ? kicker : 0);
  const legal = isLegal(candidate);
  const higher = compareRanks(candidate, standing) > 0;
  const problem = !legal
    ? "Those faces don't make a valid rank."
    : !higher
      ? `You must beat ${formatRank(standing)}.`
      : null;

  const changeCategory = (next: Category) => {
    setCategory(next);
    setFaces(fitFaces(next, faces));
    setKicker(0);
  };
  const changeFace = (position: number, value: number) => {
    const next = faces.map((f, i) => (i === position ? value : f));
    setFaces(next);
    if (next.includes(kicker)) setKicker(0);
  };

  return (
    <fieldset className="claim-picker">
      <legend>Make your claim</legend>
      <label>
        Rank
        <select value={category} onChange={(e) => changeCategory(Number(e.target.value) as Category)}>
          {Object.values(Category).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      {faces.map((face, position) => (
        <label key={position}>
          {FACE_LABELS[category]?.[position] ?? "Face"}
          <select value={face} onChange={(e) => changeFace(position, Number(e.target.value))}>
            {FACES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      ))}
      {hasKicker(category) && (
        <label>
          Kicker
          <select value={kicker} onChange={(e) => setKicker(Number(e.target.value))}>
            <option value={0}>none</option>
            {FACES.filter((f) => !faces.includes(f)).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="claim-buttons">
        <button type="button" className="primary" disabled={problem !== null} onClick={() => onClaim(candidate)}>
          Claim {formatRank(candidate)}
        </button>
        {smallest && (
          <button type="button" onClick={() => onClaim(smallest)}>
            Smallest raise: {formatRank(smallest)}
          </button>
        )}
      </div>
      {problem && <p className="hint">{problem}</p>}
    </fieldset>
  );
}
