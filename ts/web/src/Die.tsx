/** Pip positions on a 100x100 face. */
const PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

/** A die face, or an unseen die when `face` is null. */
export function Die({ face, label }: { face: number | null; label: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={face === null ? `die ${label}, unseen` : `die ${label}, showing ${face}`}
      className={face === null ? "die die-unseen" : "die"}
    >
      <rect x="4" y="4" width="92" height="92" rx="18" className="die-body" />
      {face === null ? (
        <text x="50" y="68" textAnchor="middle" className="die-mark">
          ?
        </text>
      ) : (
        PIPS[face]!.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="9" className="die-pip" />)
      )}
    </svg>
  );
}
